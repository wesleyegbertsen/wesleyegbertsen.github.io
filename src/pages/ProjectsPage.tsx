import { ProjectCard } from '../components/ProjectCard.tsx';
import { projects } from '../data/projects.ts';
import styles from './ProjectsPage.module.css';

/** Everything I've built, as cards on a glass panel over the matrix rain. */
export function ProjectsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.glass}>
        <h1 className={styles.title}>Projects</h1>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </main>
  );
}
