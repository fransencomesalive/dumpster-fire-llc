import assert from "node:assert/strict";
import {
  handlePublicProfileCatalogueSearchRequest,
  type PublicProfileCatalogueKind,
} from "../lib/public-profile/api";
import {
  searchIndustries,
  searchLocations,
  searchSkills,
} from "../lib/public-profile/catalogues";
import type { PublicAuthSession } from "../lib/public-auth/session";

const authenticatedSession: PublicAuthSession = {
  status: "authenticated",
  userId: "user_catalogue_test",
  email: "catalogue@example.com",
};

async function readJson(response: Response) {
  return response.json() as Promise<{
    status?: string;
    catalogue?: string;
    query?: string;
    limit?: number;
    results?: Array<Record<string, unknown>>;
    error?: string;
    detail?: string;
  }>;
}

async function catalogueRequest(
  kind: PublicProfileCatalogueKind,
  url: string,
  session: PublicAuthSession = authenticatedSession,
) {
  return handlePublicProfileCatalogueSearchRequest(new Request(url), kind, {
    getSession: async () => session,
  });
}

async function run() {
  const reactSkills = searchSkills("react", 5);
  assert.equal(reactSkills[0]?.name, "React");

  const projectSkills = searchSkills("project", 3);
  assert.equal(projectSkills[0]?.name, "Project Management");
  assert.ok(projectSkills.every((skill) => skill.label));

  const softwareIndustries = searchIndustries("software", 5);
  assert.ok(
    softwareIndustries.some((industry) => industry.label === "Software Development"),
    "software search should include LinkedIn Software Development",
  );

  const denverLocations = searchLocations("denver", 3);
  assert.equal(denverLocations[0]?.displayName, "Denver, CO, US");
  assert.equal(denverLocations[0]?.country, "US");

  const torontoLocations = searchLocations("toronto", 3);
  assert.equal(torontoLocations[0]?.displayName, "Toronto, 08, CA");
  assert.equal(torontoLocations[0]?.country, "CA");

  const unauthenticated = await catalogueRequest(
    "skills",
    "https://example.test/api/catalogues/skills?q=react",
    { status: "unauthenticated", reason: "Missing bearer token." },
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("Cache-Control"), "no-store");
  assert.equal((await readJson(unauthenticated)).error, "Authentication required.");

  const authenticated = await catalogueRequest(
    "skills",
    "https://example.test/api/catalogues/skills?q=react&limit=1",
  );
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.headers.get("Cache-Control"), "no-store");
  const skillsBody = await readJson(authenticated);
  assert.equal(skillsBody.status, "ready");
  assert.equal(skillsBody.catalogue, "skills");
  assert.equal(skillsBody.query, "react");
  assert.equal(skillsBody.limit, 1);
  assert.equal(skillsBody.results?.length, 1);
  assert.equal(skillsBody.results?.[0]?.name, "React");

  const emptyQuery = await catalogueRequest(
    "locations",
    "https://example.test/api/catalogues/locations",
  );
  assert.equal(emptyQuery.status, 200);
  const emptyBody = await readJson(emptyQuery);
  assert.deepEqual(emptyBody.results, []);

  const capped = await catalogueRequest(
    "industries",
    "https://example.test/api/catalogues/industries?q=services&limit=999",
  );
  const cappedBody = await readJson(capped);
  assert.equal(cappedBody.limit, 50);
  assert.ok((cappedBody.results?.length ?? 0) <= 50);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
