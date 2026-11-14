import { skills } from '../data/skills.ts';
import styles from './SkillsChips.module.css';

export function SkillsChips() {
  return (
    <ul className={styles.chips}>
      {skills.map((skill) => (
        <li key={skill.id} className={styles.chip}>
          {skill.name}
          {skill.note && <i className={styles.note}> ({skill.note})</i>}
        </li>
      ))}
    </ul>
  );
}
