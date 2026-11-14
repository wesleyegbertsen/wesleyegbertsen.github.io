import { useId } from 'react';
import type { Project } from '../data/projects.ts';
import chipStyles from './SkillsChips.module.css';
import styles from './ProjectCard.module.css';

const EXTERNAL = { target: '_blank', rel: 'noreferrer' } as const;

export function ProjectCard({ project }: { project: Project }) {
  const headingId = useId();
  const { links } = project;

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.name}>
        {project.name}
      </h2>
      <p className={styles.tagline}>{project.tagline}</p>
      <p className={styles.description}>{project.description}</p>

      <ul className={chipStyles.chips} aria-label="Built with">
        {project.tech.map((name) => (
          <li key={name} className={chipStyles.chip}>
            {name}
          </li>
        ))}
      </ul>

      <div className={styles.shots}>
        {project.screenshots.map((shot) => (
          <img
            key={shot.src}
            className={styles.shot}
            src={shot.src}
            alt={shot.alt}
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>

      <div className={styles.links}>
        <a className={styles.primary} href={links.live} {...EXTERNAL}>
          Live site
        </a>
        <a className={styles.secondary} href={links.github} {...EXTERNAL}>
          GitHub
        </a>
        {links.extras?.map((extra) => (
          <a key={extra.href} className={styles.secondary} href={extra.href} {...EXTERNAL}>
            {extra.label}
          </a>
        ))}
      </div>
      {project.license && <p className={styles.license}>License: {project.license}</p>}
    </article>
  );
}
