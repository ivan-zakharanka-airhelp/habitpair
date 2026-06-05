import { Link } from '@tanstack/react-router';
import { Icon } from '../../../shared/components/Icon';
import { LP_FAQ, LP_FEATS, LP_STEPS } from '../data';
import { DowInsight } from './DowInsight';
import { FaqItem } from './FaqItem';

export function Landing({ authed }: { authed: boolean }) {
  const primaryLabel = authed ? 'Go to your habits' : 'Start free';
  const primaryTo = authed ? '/app' : '/register';

  return (
    <main className="lp fadein">
      {/* ── hero ─────────────────────────────────────────── */}
      <section className="lp__wide">
        <div className="lp-hero">
          <div>
            <span className="lp-kicker">Build &amp; break · one honest grid</span>
            <h1 className="lp-hero__title">
              See <em>why</em> you slip, not just that you did.
            </h1>
            <p className="lp-hero__sub">
              A deliberately simple habit tracker. Mark the days, and a calm day-of-week grid
              quietly surfaces the patterns behind your misses, so you fix the cause, not just count
              streaks.
            </p>
            <div className="lp-cta-row">
              <Link to={primaryTo} className="btn btn--primary btn--lg">
                {primaryLabel}
              </Link>
              {!authed ? (
                <Link to="/login" className="btn btn--ghost btn--lg">
                  Log in
                </Link>
              ) : null}
            </div>
            <div className="lp-trust">
              <span>
                <Icon name="check" size={15} /> Free to use
              </span>
              <span>
                <Icon name="check" size={15} /> Private by default
              </span>
              <span>
                <Icon name="check" size={15} /> No nagging
              </span>
            </div>
          </div>
          <DowInsight />
        </div>
      </section>

      {/* ── the difference ───────────────────────────────── */}
      <div className="lp-band lp-band--tint">
        <section className="lp__wide lp-sec lp-sec--center">
          <span className="lp-kicker">The difference</span>
          <h2 className="lp-h2">Other trackers count misses. Habitpair explains them.</h2>
          <p className="lp-lead">
            A broken streak tells you something went wrong, not what. Habitpair plots every mark
            against the day of the week, so the pattern shows itself: you slip on the same days.
            Once you see it, you can plan around it.
          </p>
        </section>
      </div>

      {/* ── product showcase / any device ────────────────── */}
      <section className="lp__wide lp-sec">
        <span className="lp-kicker">Anywhere you are</span>
        <h2 className="lp-h2">Open it on any screen. Everything stays in sync.</h2>
        <p className="lp-lead">
          Habitpair is a real app, not just a website. It runs in any browser and on your phone.
          Mark a day on your phone at breakfast; it’s already there on your laptop by lunch. Your
          habits live in your account, synced the moment you tap.
        </p>
        <div className="lp-stage">
          <div className="lp-window">
            <div className="lp-window__bar">
              <span className="lp-window__dot" />
              <span className="lp-window__dot" />
              <span className="lp-window__dot" />
              <span className="lp-window__url">
                <Icon name="check" size={12} /> habitpair.com
              </span>
            </div>
            <img
              src="/product/detail.png"
              alt="A Habitpair habit detail screen on a laptop, showing current streak, consistency and completion stats above a multi-month calendar of completed and missed days."
              loading="lazy"
            />
            <span className="lp-synced">
              <Icon name="check" size={13} /> Synced just now
            </span>
          </div>
          <div className="lp-window lp-window--sm">
            <div className="lp-window__bar">
              <span className="lp-window__dot" />
              <span className="lp-window__dot" />
              <span className="lp-window__dot" />
              <span className="lp-window__url">Today</span>
            </div>
            <img
              src="/product/list.png"
              alt="The Habitpair home screen listing the habits being built, each with a seven-day strip and streak count, and a ring showing all habits done today."
              loading="lazy"
            />
          </div>
        </div>
        <div className="lp-devs">
          <span className="lp-dev">
            <span className="lp-dev__glyph lp-dev__glyph--phone" /> Phone
          </span>
          <span className="lp-dev">
            <span className="lp-dev__glyph lp-dev__glyph--tablet" /> Tablet
          </span>
          <span className="lp-dev">
            <span className="lp-dev__glyph lp-dev__glyph--laptop" /> Laptop &amp; desktop
          </span>
          <span className="lp-dev">
            <Icon name="check" size={15} /> Private, synced account
          </span>
        </div>
      </section>

      {/* ── how it works ─────────────────────────────────── */}
      <section className="lp__wide lp-sec">
        <span className="lp-kicker">How it works</span>
        <h2 className="lp-h2">Three taps from setup to insight.</h2>
        <div className="lp-steps">
          {LP_STEPS.map((s) => (
            <div className="lp-step" key={s.t}>
              <span className="lp-step__n" />
              <h3 className="lp-step__t">{s.t}</h3>
              <p className="lp-step__d">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── build & break ────────────────────────────────── */}
      <div className="lp-band lp-band--tint">
        <section className="lp__wide lp-sec">
          <span className="lp-kicker">Two sides, one grid</span>
          <h2 className="lp-h2">For the habits you want, and the ones you don’t.</h2>
          <div className="lp-duo">
            <div className="lp-modecard">
              <div className="lp-modecard__ico lp-modecard__ico--pos">
                <Icon name="sprout" size={22} />
              </div>
              <h3 className="lp-modecard__t">Building</h3>
              <p className="lp-modecard__d">
                Count the days you show up. Daily, weekly, or monthly. Habitpair tracks the cadence
                that fits the habit, not a one-size streak.
              </p>
              <div className="lp-chiprow">
                <span className="lp-chip">Morning run</span>
                <span className="lp-chip">Read 20 min</span>
                <span className="lp-chip">Gym 3× / week</span>
              </div>
            </div>
            <div className="lp-modecard">
              <div className="lp-modecard__ico lp-modecard__ico--neg">
                <Icon name="x" size={20} />
              </div>
              <h3 className="lp-modecard__t">Breaking</h3>
              <p className="lp-modecard__d">
                Count the days you stay clean. The same calm grid, working in reverse, quietly
                rewarding the streaks you keep, not punishing the ones you lose.
              </p>
              <div className="lp-chiprow">
                <span className="lp-chip">No late scrolling</span>
                <span className="lp-chip">Skip the snooze</span>
                <span className="lp-chip">No sugar</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── features ─────────────────────────────────────── */}
      <section className="lp__wide lp-sec">
        <span className="lp-kicker">Everything, nothing more</span>
        <h2 className="lp-h2">Calm tools that earn their place.</h2>
        <div className="lp-feats">
          {LP_FEATS.map((f) => (
            <div className="lp-feat" key={f.t}>
              <div className="lp-feat__ico">
                <Icon name={f.ico} size={19} />
              </div>
              <h3 className="lp-feat__t">{f.t}</h3>
              <p className="lp-feat__d">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <div className="lp-band lp-band--tint">
        <section className="lp__wide lp-sec lp-sec--center">
          <span className="lp-kicker">Questions</span>
          <h2 className="lp-h2">The short answers.</h2>
          <div className="lp-faq" style={{ textAlign: 'left' }}>
            {LP_FAQ.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </section>
      </div>

      {/* ── final CTA ────────────────────────────────────── */}
      <section className="lp__wide lp-final">
        <span className="lp-kicker" style={{ justifyContent: 'center' }}>
          Start today
        </span>
        <h2 className="lp-final__t">Mark one day. Then see what it tells you.</h2>
        <p className="lp-final__d">
          Two habits, one honest grid. Free, private, and quiet. Exactly as much tracker as you
          need.
        </p>
        <Link to={primaryTo} className="btn btn--primary btn--lg">
          {primaryLabel}
        </Link>
      </section>

      {/* ── footer ───────────────────────────────────────── */}
      <footer className="lp-band lp-foot">
        <div className="lp__wide lp-foot__inner">
          <span className="lp-foot__brand">
            <span className="brand__mark" /> habitpair
          </span>
          <span className="lp-foot__note">
            A deliberately simple habit tracker · Build &amp; break, one grid
          </span>
        </div>
      </footer>
    </main>
  );
}
