import { images } from '../../assets/index.ts';
import styles from './MailLink.module.css';

export function MailLink() {
  return (
    <a className={styles.mail} href="mailto:wesleyegbertsen@gmail.com">
      <img src={images.mail} alt="Email Wesley" draggable={false} />
    </a>
  );
}
