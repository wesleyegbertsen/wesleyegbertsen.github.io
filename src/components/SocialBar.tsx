import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faToolbox } from '@fortawesome/free-solid-svg-icons';
import { faGithub, faLinkedin } from '@fortawesome/free-brands-svg-icons';
import { ExperienceTimeline } from './ExperienceTimeline.tsx';
import { Panel } from './Panel.tsx';
import { SkillsChips } from './SkillsChips.tsx';
import styles from './SocialBar.module.css';

type PanelName = 'skills' | 'experience';

export function SocialBar() {
  const [open, setOpen] = useState<PanelName | null>(null);
  const skillsButton = useRef<HTMLButtonElement>(null);
  const experienceButton = useRef<HTMLButtonElement>(null);

  const toggle = (name: PanelName) => setOpen((current) => (current === name ? null : name));
  const close = () => setOpen(null);

  return (
    <>
      <nav className={styles.bar} aria-label="Social and about">
        <a
          className={`${styles.item} ${styles.github}`}
          href="https://github.com/wesleyegbertsen/"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          title="GitHub"
        >
          <FontAwesomeIcon icon={faGithub} />
        </a>
        <button
          ref={skillsButton}
          type="button"
          className={`${styles.item} ${styles.skills}`}
          aria-label="Skills"
          title="Skills"
          aria-expanded={open === 'skills'}
          aria-controls="skills-panel"
          onClick={() => toggle('skills')}
        >
          <FontAwesomeIcon icon={faToolbox} />
        </button>
        <button
          ref={experienceButton}
          type="button"
          className={`${styles.item} ${styles.experience}`}
          aria-label="Work experience"
          title="Work Experience"
          aria-expanded={open === 'experience'}
          aria-controls="experience-panel"
          onClick={() => toggle('experience')}
        >
          <FontAwesomeIcon icon={faBuilding} />
        </button>
        <a
          className={`${styles.item} ${styles.linkedin}`}
          href="https://www.linkedin.com/in/wesleyegbertsen/"
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn"
          title="LinkedIn"
        >
          <FontAwesomeIcon icon={faLinkedin} />
        </a>
      </nav>

      {open === 'skills' && (
        <Panel id="skills-panel" title="My Technical Skills" onClose={close} returnFocusRef={skillsButton}>
          <SkillsChips />
        </Panel>
      )}
      {open === 'experience' && (
        <Panel
          id="experience-panel"
          title="My Work Experience"
          onClose={close}
          returnFocusRef={experienceButton}
        >
          <ExperienceTimeline />
        </Panel>
      )}
    </>
  );
}
