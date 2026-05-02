/**
 * Types partagés du service briefs, séparés pour éviter les imports
 * circulaires entre datafer-env.ts et briefs-service.ts.
 */

export type CreateBriefInput = {
  keyword: string;
  country?: string;
  folderId?: string | null;
  myUrl?: string | null;
};
