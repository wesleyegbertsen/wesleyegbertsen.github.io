import { education } from '../data/education.ts';
import styles from './ExperienceTimeline.module.css';

export function EducationTimeline() {
  return (
    <ol className={styles.timeline}>
      {education.map((item) => (
        <li key={item.id} className={styles.job}>
          <h3 className={styles.jobTitle}>{item.school}</h3>
          <p className={styles.where}>{item.program}</p>
          {item.profile && <p className={styles.where}>Profile: {item.profile}</p>}
          <p className={styles.when}>
            {item.start} - {item.end}
          </p>
        </li>
      ))}
    </ol>
  );
}
