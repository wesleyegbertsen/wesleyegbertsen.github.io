import cardipawHome from '../assets/images/projects/cardipaw-home.png';
import cardipawTracker from '../assets/images/projects/cardipaw-tracker.png';
import cardipawPetDetail from '../assets/images/projects/cardipaw-pet-detail.png';
import cardipawReadings from '../assets/images/projects/cardipaw-readings.png';

export type Screenshot = {
  src: string;
  alt: string;
};

export type Project = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** `YYYY-MM`, used to sort newest first. */
  published: string;
  tech: string[];
  license?: string;
  screenshots: Screenshot[];
  links: {
    live: string;
    github: string;
    extras?: { label: string; href: string }[];
  };
};

/** Newest first. Add a project here and it appears on the Projects page. */
export const projects: Project[] = [
  {
    id: 'cardipaw',
    name: 'CardiPaw',
    tagline: 'A resting respiratory rate tracker for pets with heart conditions.',
    description:
      'Count breaths with a guided timer, follow the trend over time and share a clear report with your vet. ' +
      'I built it after my cat Lushi was diagnosed with HCM. Free and open source, and the pet data stays on ' +
      'your device instead of a server. Runs in the browser, as an Android app and as a Docker image.',
    published: '2026-04',
    tech: ['TypeScript', 'Vue', 'Pinia', 'Vite', 'Capacitor', 'Docker'],
    license: 'GPL-3.0',
    screenshots: [
      {
        src: cardipawHome,
        alt: 'CardiPaw home screen: each pet with a 7-day sparkline, one with a Trending up badge',
      },
      {
        src: cardipawTracker,
        alt: 'CardiPaw guided tracker: tap the heart for each breath during a 30-second count',
      },
      {
        src: cardipawPetDetail,
        alt: "CardiPaw pet page with its week chart and the Normal ceiling",
      },
      {
        src: cardipawReadings,
        alt: "CardiPaw readings list, each reading with its rate and status label",
      },
    ],
    links: {
      live: 'https://cardipaw.com/',
      github: 'https://github.com/wesleyegbertsen/CardiPaw',
      extras: [
        { label: 'Android APK', href: 'https://github.com/wesleyegbertsen/CardiPaw/releases/latest' },
        { label: 'Docker image', href: 'https://hub.docker.com/r/wesleyegbertsen/cardipaw' },
      ],
    },
  },
];
