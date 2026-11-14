export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  start: string;
  /** `null` means the job is current. */
  end: string | null;
  stack: string[];
};

/** Newest first. */
export const experience: Job[] = [
  {
    id: 'betabit-consultant',
    title: 'Consultant',
    company: 'Betabit',
    location: 'Apeldoorn (Hybrid)',
    start: 'May 2026',
    end: null,
    stack: ['Full-stack Azure .NET Developer'],
  },
  {
    id: 'robinhq-senior',
    title: 'Senior Software Developer',
    company: 'RobinHQ.com (part of CM.com)',
    location: 'Arnhem',
    start: 'September 2021',
    end: 'April 2026',
    stack: [
      'C#', '.NET', 'ASP.NET', 'MVC', 'MSSQL', 'Azure', 'Azure DevOps', 'Git',
      'JavaScript', 'HTML', 'CSS', 'Bicep (IaC)', 'Docker', 'Azure Service Bus',
      'Mass Transit', 'Microservices', 'CI/CD', 'Application Insights',
      'Azure Functions', 'Azure App Service', 'PowerShell',
      'Azure Key Vault', 'Azure Container Apps', 'Microsoft Entra ID',
      'Azure App Configuration', 'Azure Storage Account',
      'Azure Service Fabric', 'jQuery UI', 'AngularJS', 'Angular',
    ],
  },
  {
    id: 'robinhq-medior',
    title: 'Medior Software Developer',
    company: 'RobinHQ.com (part of CM.com)',
    location: 'Arnhem',
    start: 'July 2020',
    end: 'September 2021',
    stack: [
      'C#', '.NET', 'ASP.NET', 'MVC', 'MSSQL', 'Azure', 'Azure DevOps', 'Git',
      'JavaScript', 'HTML', 'CSS', 'ARM templates (IaC)', 'CI/CD',
      'Application Insights', 'Azure Functions', 'Azure App Service',
      'PowerShell', 'Azure Key Vault', 'Azure Traffic Manager',
      'Azure Storage Account', 'Azure Service Fabric', 'jQuery UI',
      'AngularJS', 'Angular',
    ],
  },
  {
    id: 'robinhq-junior',
    title: 'Junior Software Developer',
    company: 'RobinHQ.com',
    location: 'Arnhem',
    start: 'January 2018',
    end: 'July 2020',
    stack: [
      'C#', '.NET', 'ASP.NET', 'MVC', 'MSSQL', 'Azure', 'Azure DevOps', 'Git',
      'JavaScript', 'HTML', 'CSS', 'CI/CD', 'Application Insights', 'PowerShell',
      'Azure Storage Account', 'Azure App Service', 'jQuery UI', 'AngularJS',
    ],
  },
  {
    id: 'robinhq-internship',
    title: 'Software Developer (Graduation Internship HAN)',
    company: 'RobinHQ.com',
    location: 'Arnhem',
    start: 'September 2017',
    end: 'January 2018',
    stack: [
      'C#', '.NET', 'ASP.NET', 'MVC', 'MSSQL', 'Azure', 'Azure DevOps', 'Git',
      'JavaScript', 'HTML', 'CSS',
    ],
  },
  {
    id: 'marin-internship',
    title: 'Web Developer (Internship)',
    company: 'MARIN',
    location: 'Wageningen',
    start: 'September 2015',
    end: 'January 2016',
    stack: ['java', 'javascript', 'html', 'css', 'jsf', 'primefaces', 'glassfish'],
  },
  {
    id: 'isatis-web-internship',
    title: 'Web Developer (Graduation Internship ROC A12)',
    company: 'Isatis',
    location: 'Nijmegen',
    start: 'March 2014',
    end: 'June 2014',
    stack: ['mvc4', 'asp.net', 'css', 'javascript', 'ajax', 'webservice'],
  },
  {
    id: 'isatis-android-internship',
    title: 'Android app developer (Internship)',
    company: 'Isatis',
    location: 'Nijmegen',
    start: 'September 2013',
    end: 'January 2014',
    stack: ['java', 'android', 'sqlite', 'json', 'webservice'],
  },
  {
    id: 'dialogus-internship',
    title: 'PHP Developer via Wordpress (Internship)',
    company: 'Dialogus',
    location: 'Arnhem',
    start: 'January 2013',
    end: 'June 2013',
    stack: ['php', 'html', 'javascript', 'css', 'ajax', 'mysql'],
  },
  {
    id: '2m-solutions-internship',
    title: 'Web developer (Internship)',
    company: '²M-Solutions',
    location: 'Elst',
    start: 'January 2012',
    end: 'June 2012',
    stack: ['php', 'html', 'javascript', 'css', 'ajax', 'mysql'],
  },
];
