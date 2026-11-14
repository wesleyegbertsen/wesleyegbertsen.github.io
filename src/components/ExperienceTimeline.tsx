import { experience } from '../data/experience.ts';
import styles from './ExperienceTimeline.module.css';

export function ExperienceTimeline() {
  return (
    <ol className={styles.timeline}>
      {experience.map((job) => (
        <li key={job.id} className={styles.job}>
          <h3 className={styles.jobTitle}>{job.title}</h3>
          <p className={styles.where}>
            {job.company}, {job.location}
          </p>
          <p className={styles.when}>
            {job.start} - {job.end ?? 'Present'}
          </p>
          <p className={styles.stack}>{job.stack.join(', ')}</p>
        </li>
      ))}
    </ol>
  );
}
