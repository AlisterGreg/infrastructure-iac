// Projects v2 access. Works for a user-owned or an organisation-owned project.

const BOARD_QUERY = `
query($login: String!, $number: Int!) {
  user(login: $login) { projectV2(number: $number) { ...ProjectFields } }
  organization(login: $login) { projectV2(number: $number) { ...ProjectFields } }
}
fragment ProjectFields on ProjectV2 {
  id
  fields(first: 100) {
    nodes {
      ... on ProjectV2SingleSelectField { id name options { id name } }
    }
  }
}`;

const ADD_ITEM = `
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
}`;

const SET_OPTION = `
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId }
  }) { projectV2Item { id } }
}`;

export async function loadBoard(gh, { owner, number }) {
  const { data, errors } = await gh.graphql(BOARD_QUERY, { login: owner, number });
  // The user/organization lookup that does not match returns an error, so only fail when neither matched.
  const project = data?.user?.projectV2 ?? data?.organization?.projectV2;
  if (!project) {
    throw new Error(`Project ${number} not found for ${owner}: ${(errors ?? []).map((e) => e.message).join('; ')}`);
  }
  const fields = {};
  for (const field of project.fields.nodes) {
    if (field?.name && field.options) {
      fields[field.name] = {
        id: field.id,
        options: Object.fromEntries(field.options.map((option) => [option.name.toLowerCase(), option.id])),
      };
    }
  }
  return { id: project.id, fields };
}

// Adds an issue to the board and sets single-select fields such as { Priority: 'High', Size: 'M' }.
// Returns the errors for any step that failed, so the issue is kept even if the board step is partial.
export async function addIssueToBoard(gh, board, contentNodeId, values) {
  const errors = [];
  const added = await gh.graphql(ADD_ITEM, { projectId: board.id, contentId: contentNodeId });
  const itemId = added.data?.addProjectV2ItemById?.item?.id;
  if (!itemId) {
    return { itemId: null, errors: [`add to board failed: ${(added.errors ?? []).map((e) => e.message).join('; ')}`] };
  }

  for (const [fieldName, optionName] of Object.entries(values)) {
    const field = board.fields[fieldName];
    if (!field) {
      errors.push(`board has no ${fieldName} field`);
      continue;
    }
    const optionId = field.options[String(optionName).toLowerCase()];
    if (!optionId) {
      errors.push(`${fieldName} has no option ${optionName}`);
      continue;
    }
    const set = await gh.graphql(SET_OPTION, { projectId: board.id, itemId, fieldId: field.id, optionId });
    if (set.errors) errors.push(`${fieldName}: ${set.errors.map((e) => e.message).join('; ')}`);
  }
  return { itemId, errors };
}
