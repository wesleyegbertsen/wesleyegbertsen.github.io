export type Skill = {
  id: string;
  name: string;
  note?: string;
};

export const skills: Skill[] = [
  { id: 'csharp', name: 'C#' },
  { id: 'dotnet', name: '.NET' },
  { id: 'aspnet', name: 'ASP.NET' },
  { id: 'mvc', name: 'MVC' },
  { id: 'mssql', name: 'MSSQL' },
  { id: 'azure', name: 'Azure' },
  { id: 'azure-devops', name: 'Azure DevOps' },
  { id: 'git', name: 'Git' },
  { id: 'github', name: 'GitHub' },
  { id: 'ci-cd', name: 'CI/CD' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'html', name: 'HTML' },
  { id: 'css', name: 'CSS' },
  { id: 'iac', name: 'IaC' },
  { id: 'docker', name: 'Docker' },
  { id: 'generative-ai', name: 'Generative AI', note: 'Images & LoRA training' },
];
