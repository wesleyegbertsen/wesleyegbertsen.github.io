import { useId } from 'react';
import { Link } from 'react-router';
import type { Project } from '../data/projects.ts';
import styles from './FeaturedProject.module.css';

/** A small teaser for one project, with a link to the full Projects page. */
export function FeaturedProject({ project }: { project: Project }) {
  const headingId = useId();
  const shot = project.screenshots[0];

  return (
    <section className={styles.teaser} aria-labelledby={headingId}>
      {shot && (
        <img
          className={styles.shot}
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading="lazy"
          decoding="async"
        />
      )}
      <div className={styles.text}>
        <p className={styles.label}>Featured project</p>
        <h2 id={headingId} className={styles.name}>
          {project.name}
        </h2>
        <p className={styles.tagline}>{project.tagline}</p>
        <Link className={styles.link} to="/projects">
          View projects
        </Link>
      </div>
    </section>
  );
}
