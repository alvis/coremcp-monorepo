import clsx from 'clsx';
import Link from '@docusaurus/Link';

type SummaryItem = {
  label: string;
  text: string;
};

type ActionItem = {
  href: string;
  label: string;
  variant?: 'primary' | 'secondary';
};

type StatItem = {
  label: string;
  value: string;
};

type PairItem = {
  title: string;
  text: string;
};

type LinkItem = {
  href: string;
  label: string;
};

type Tone =
  | 'orientation'
  | 'mental-model'
  | 'package-model'
  | 'deployment'
  | 'protocol'
  | 'transport'
  | 'integration'
  | 'reference';

type DocsPageIntroProps = {
  eyebrow: string;
  title: string;
  lead: string;
  summary: SummaryItem[];
  tone?: Tone;
};

type DocsHeroProps = {
  eyebrow: string;
  title: string;
  lead: string;
  actions: ActionItem[];
  stats: StatItem[];
  imageSrc: string;
  imageAlt?: string;
  tone?: Tone;
};

export function DocsPageIntro({
  eyebrow,
  title,
  lead,
  summary,
  tone = 'orientation',
}: DocsPageIntroProps) {
  return (
    <section className="docsPageIntroShell" data-tone={tone}>
      <div className="docsPageIntroCopy">
        <p className="docsPageEyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="docsPageLead">{lead}</div>
      </div>

      <div className="docsPageSummary" role="list">
        {summary.map((item) => (
          <div key={item.label} className="docsPageSummaryItem" role="listitem">
            <span>{item.label}</span>
            <div>{item.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DocsHero({
  eyebrow,
  title,
  lead,
  actions,
  stats,
  imageSrc,
  imageAlt = '',
  tone = 'orientation',
}: DocsHeroProps) {
  return (
    <section className="docsHero" data-tone={tone}>
      <div className="docsHeroMedia" aria-hidden={imageAlt ? undefined : true}>
        <img src={imageSrc} alt={imageAlt} />
      </div>

      <div className="docsHeroInner">
        <p className="docsHeroEyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="docsHeroLead">{lead}</div>

        <div className="docsHeroActions">
          {actions.map((action) => (
            <Link
              key={action.href}
              className={clsx(
                action.variant === 'secondary'
                  ? 'docsHeroSecondary'
                  : 'docsHeroPrimary',
              )}
              to={action.href}
            >
              {action.label}
            </Link>
          ))}
        </div>

        <div className="docsHeroStats" role="list">
          {stats.map((item) => (
            <div key={item.label} className="docsHeroStat" role="listitem">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DocsInfoGrid({ items }: { items: PairItem[] }) {
  return (
    <div className="docsPageInfoGrid">
      {items.map((item) => (
        <div key={item.title}>
          <strong>{item.title}</strong>
          <div>{item.text}</div>
        </div>
      ))}
    </div>
  );
}

export function DocsSectionCard({
  title,
  items,
}: {
  title?: string;
  items: string[];
}) {
  return (
    <div className="docsPageSectionCard">
      {title ? <strong>{title}</strong> : null}
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function DocsDecision({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="docsPageDecision">
      <strong>{title}</strong>
      <div>{text}</div>
    </div>
  );
}

export function DocsNextLinks({
  links,
}: {
  links: LinkItem[];
}) {
  return (
    <div className="docsPageNext">
      <strong>Read next</strong>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link to={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
