import { Platform } from 'react-native';
import { loadNativeAudio } from './native';

/**
 * The lock-screen transport.
 *
 * A session is fifteen to forty-five minutes long and the listener is lying
 * down with their eyes shut, so for most of its length the app is behind a
 * locked screen. This is the only interface they have while it is: the
 * protocol's name, how far through it is, and a way to stop it without
 * unlocking the phone and finding the player again.
 *
 * It is deliberately thin. The controller owns playback and every transition
 * still goes through the same fades; this class only mirrors state outwards and
 * turns a button press back into a command. It reports nothing it cannot do —
 * the controls it publishes are exactly the three the engine actually supports
 * (§65), and skip, seek and next/previous are switched *off* explicitly because
 * iOS enables them by default and a protocol has no next track.
 */

export type TransportCommand = 'play' | 'pause' | 'stop';

export interface NowPlayingInfo {
  /** The protocol's name — what the lock screen calls this session. */
  title: string;
  /** Second line: the running stage, and the sleep timer when one is armed. */
  detail: string;
  durationSec: number;
  elapsedSec: number;
  /** False while paused. The platforms draw the transport from this. */
  playing: boolean;
}

/**
 * How often the elapsed time is pushed out, in milliseconds.
 *
 * Both platforms extrapolate the position themselves from the playback rate we
 * publish alongside it — iOS from `MPNowPlayingInfoPropertyPlaybackRate`,
 * Android from the `PlaybackState` position and speed — so the clock on the
 * lock screen keeps ticking between pushes. Five seconds is therefore about
 * correcting drift, not about drawing the clock, and every push crosses the
 * bridge and re-posts a notification. Anything that changes what the transport
 * *says* — playing to paused, a new stage — is pushed immediately regardless.
 */
const RESYNC_INTERVAL_MS = 5000;

/** The controls the transport publishes, and the ones it explicitly withdraws. */
const ENABLED_CONTROLS = ['play', 'pause', 'stop'] as const;
const DISABLED_CONTROLS = [
  'nextTrack',
  'previousTrack',
  'skipForward',
  'skipBackward',
  'seekTo',
] as const;

type Subscription = { remove: () => void };

export class NowPlayingTransport {
  private handler: ((command: TransportCommand) => void) | null = null;
  private subscriptions: Subscription[] = [];
  private shown = false;
  private lastPushedAt = 0;
  private lastInfo: NowPlayingInfo | null = null;
  /** Whether the control set has been stated to the platform for this session. */
  private controlsPublished = false;
  /** Android only, and asked at most once per launch. */
  private notificationPermissionRequested = false;

  /**
   * Publishes the transport and starts routing its buttons to `handler`.
   *
   * Calling it again replaces the handler and the metadata rather than stacking
   * a second set of listeners, so a session that starts while another is being
   * torn down cannot leave a dead subscription pointing at the old playback.
   */
  attach(info: NowPlayingInfo, handler: (command: TransportCommand) => void): void {
    this.release();
    this.handler = handler;
    this.shown = true;
    this.lastInfo = null;
    this.lastPushedAt = 0;

    if (Platform.OS === 'web') {
      this.attachMediaSession();
    } else {
      this.attachNotification();
    }
    this.update(info);
  }

  /**
   * Mirrors the current state out to the lock screen.
   *
   * Safe to call at the controller's emit rate: a push only actually happens
   * when the transport would show something different, or when the position has
   * had time to drift.
   */
  update(info: NowPlayingInfo): void {
    if (!this.shown) return;

    const previous = this.lastInfo;
    // Where the platform believes the playhead is: the last position we pushed,
    // advanced by the rate we pushed with it. A position that has left that
    // estimate behind — a seek, or a session that underran — is worth a push of
    // its own rather than five seconds of a wrong clock.
    const extrapolated =
      previous === null
        ? 0
        : previous.elapsedSec + (previous.playing ? (Date.now() - this.lastPushedAt) / 1000 : 0);
    const changed =
      previous === null ||
      previous.playing !== info.playing ||
      previous.title !== info.title ||
      previous.detail !== info.detail ||
      Math.abs(previous.durationSec - info.durationSec) > 0.5 ||
      Math.abs(info.elapsedSec - extrapolated) > 3;
    if (!changed && Date.now() - this.lastPushedAt < RESYNC_INTERVAL_MS) return;

    this.lastInfo = info;
    this.lastPushedAt = Date.now();

    if (Platform.OS === 'web') this.pushMediaSession(info);
    else this.pushNotification(info);
  }

  /** Takes the transport down and stops listening. Idempotent. */
  release(): void {
    for (const subscription of this.subscriptions) {
      try {
        subscription.remove();
      } catch {
        // A subscription whose native module has already gone away.
      }
    }
    this.subscriptions = [];
    this.handler = null;
    this.lastInfo = null;
    this.controlsPublished = false;

    if (!this.shown) return;
    this.shown = false;
    if (Platform.OS === 'web') this.clearMediaSession();
    else this.hideNotification();
  }

  private dispatch(command: TransportCommand): void {
    this.handler?.(command);
  }

  // --- Native: MPNowPlayingInfoCenter on iOS, a MediaStyle notification on
  // Android. Both are driven by the same `PlaybackNotificationManager`, and on
  // Android showing it is also what starts the media-playback foreground
  // service that keeps the process alive behind a locked screen.

  private attachNotification(): void {
    const manager = loadNativeAudio()?.PlaybackNotificationManager;
    if (!manager) return;
    try {
      const events = [
        ['playbackNotificationPlay', 'play'],
        ['playbackNotificationPause', 'pause'],
        ['playbackNotificationStop', 'stop'],
        // Swiping the notification away is a request to stop, not a request to
        // keep playing something with no visible way to stop it.
        ['playbackNotificationDismissed', 'stop'],
      ] as const;
      for (const [event, command] of events) {
        const subscription = manager.addEventListener(event, () => this.dispatch(command));
        if (subscription) this.subscriptions.push(subscription);
      }
    } catch {
      // Losing the buttons must not lose the audio: the session plays on
      // without a transport rather than failing to start.
    }
  }

  private pushNotification(info: NowPlayingInfo): void {
    const manager = loadNativeAudio()?.PlaybackNotificationManager;
    if (!manager) return;

    const publishControls = !this.controlsPublished;
    void manager
      .show({
        title: info.title,
        artist: info.detail,
        album: 'Frequency Lab',
        duration: info.durationSec,
        elapsedTime: info.elapsedSec,
        // The rate the platforms extrapolate the position with. Zero while
        // paused is what freezes the clock on the lock screen.
        speed: info.playing ? 1 : 0,
        state: info.playing ? 'playing' : 'paused',
      })
      .then(() => {
        if (!publishControls || this.controlsPublished || !this.shown) return;
        this.controlsPublished = true;
        // Android starts with no controls at all and iOS starts with several we
        // cannot honour, so the set is stated explicitly, once, after the
        // notification exists.
        for (const control of ENABLED_CONTROLS) void manager.enableControl(control, true);
        for (const control of DISABLED_CONTROLS) void manager.enableControl(control, false);
      })
      .catch(() => {
        // Typically a build with no native module linked, or an Android
        // notification the user has denied. Neither is a reason to stop.
      });

    this.requestAndroidNotificationPermission();
  }

  private hideNotification(): void {
    const manager = loadNativeAudio()?.PlaybackNotificationManager;
    if (!manager) return;
    void manager.hide().catch(() => {
      // Hiding a notification that was never shown.
    });
  }

  /**
   * Android 13 and later need `POST_NOTIFICATIONS` before a media notification
   * is visible. Asked in context — at the moment the transport would appear —
   * and never twice, and playback never waits on the answer: denying it costs
   * the controls, not the session.
   */
  private requestAndroidNotificationPermission(): void {
    if (Platform.OS !== 'android' || this.notificationPermissionRequested) return;
    this.notificationPermissionRequested = true;
    const audioManager = loadNativeAudio()?.AudioManager;
    if (!audioManager) return;
    void audioManager
      .checkNotificationPermissions()
      .then((status) => {
        if (status !== 'Undetermined') return;
        return audioManager.requestNotificationPermissions().then(() => undefined);
      })
      .catch(() => {
        // The request needs a foreground activity; without one it throws rather
        // than resolving, and the transport simply stays hidden.
      });
  }

  // --- Web: the Media Session API.
  //
  // The browser is the one platform with no lock screen of its own to speak
  // for, and browsers generally only surface media UI for an <audio>/<video>
  // element — this app synthesises straight into a Web Audio graph, so on most
  // browsers this metadata is set and never displayed. It is here because it
  // costs nothing and is correct where it is honoured (a keyboard's media keys,
  // a desktop OS media panel). Nothing about the native path depends on it.

  private get mediaSession(): MediaSession | null {
    if (typeof navigator === 'undefined') return null;
    return navigator.mediaSession ?? null;
  }

  private attachMediaSession(): void {
    const session = this.mediaSession;
    if (!session) return;
    const actions: [MediaSessionAction, TransportCommand][] = [
      ['play', 'play'],
      ['pause', 'pause'],
      ['stop', 'stop'],
    ];
    for (const [action, command] of actions) {
      try {
        session.setActionHandler(action, () => this.dispatch(command));
        // Handlers are not subscriptions; they are cleared by name on release.
      } catch {
        // A browser that does not know this action throws rather than ignoring
        // it. The other two are still worth having.
      }
    }
  }

  private pushMediaSession(info: NowPlayingInfo): void {
    const session = this.mediaSession;
    if (!session) return;
    try {
      if (typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({
          title: info.title,
          artist: info.detail,
          album: 'Frequency Lab',
        });
      }
      session.playbackState = info.playing ? 'playing' : 'paused';
      session.setPositionState?.({
        duration: Math.max(0, info.durationSec),
        // Clamped: a position past the duration is a TypeError, and the
        // protocol clock can land a fraction beyond it on the last block.
        position: Math.min(Math.max(0, info.elapsedSec), Math.max(0, info.durationSec)),
        playbackRate: info.playing ? 1 : 0,
      });
    } catch {
      // Media Session is a nicety on web; it never gets to break playback.
    }
  }

  private clearMediaSession(): void {
    const session = this.mediaSession;
    if (!session) return;
    for (const action of ['play', 'pause', 'stop'] as MediaSessionAction[]) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // As above: an action this browser has never heard of.
      }
    }
    try {
      session.playbackState = 'none';
      session.metadata = null;
    } catch {
      // Nothing left to clear.
    }
  }
}
