/**
 * CI/CD pipeline template generators for GitHub Actions and GitLab CI.
 * Pure functions — no I/O, easily testable.
 */

/**
 * Returns the GitHub Actions workflow YAML for Constellation indexing.
 * Uses the official ShiftinBits/constellation-github action.
 * @param branch - The branch to trigger indexing on (from constellation.json)
 */
export function getGitHubActionsWorkflow(branch: string): string {
	return `name: Constellation Index

on:
  push:
    branches: ["${branch}"]

permissions:
  contents: read

jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ShiftinBits/constellation-github@v1
        with:
          access-key: \${{ secrets.CONSTELLATION_ACCESS_KEY }}
`;
}

/**
 * Returns structured GitLab CI config objects for merging into existing files.
 * @param branch - The branch to trigger indexing on (from constellation.json)
 */
export function getGitLabCIConfig(branch: string): {
	includeEntry: { component: string; inputs: { access_key: string } };
	job: { rules: Array<{ if: string }> };
} {
	return {
		includeEntry: {
			component:
				'gitlab.com/shiftinbits/constellation-gitlab/constellation-index@1',
			inputs: {
				access_key: '$CONSTELLATION_ACCESS_KEY',
			},
		},
		job: {
			rules: [{ if: `$CI_COMMIT_BRANCH == "${branch}"` }],
		},
	};
}

/**
 * Returns the full GitLab CI YAML for creating a new .gitlab-ci.yml file.
 * @param branch - The branch to trigger indexing on (from constellation.json)
 */
export function getGitLabCIFreshYaml(branch: string): string {
	return `include:
  - component: gitlab.com/shiftinbits/constellation-gitlab/constellation-index@1
    inputs:
      access_key: $CONSTELLATION_ACCESS_KEY

constellation-index:
  rules:
    - if: $CI_COMMIT_BRANCH == "${branch}"
`;
}
