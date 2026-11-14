export type Education = {
  id: string;
  school: string;
  program: string;
  profile?: string;
  start: string;
  end: string;
};

/** Newest first. */
export const education: Education[] = [
  {
    id: 'han',
    school: 'HAN University of Applied Sciences',
    program: "Bachelor's degree, Information Technology",
    profile: 'Web Development',
    start: '2014',
    end: '2018',
  },
  {
    id: 'roc-a12',
    school: 'ROC A12 Velp',
    program: 'MBO Level 4, Application Developer',
    start: '2010',
    end: '2014',
  },
  {
    id: 'westeraam',
    school: 'Het Westeraam',
    program: 'VMBO-TL',
    profile: 'Economics',
    start: '2006',
    end: '2010',
  },
];
