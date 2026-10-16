# Software Factory infrastructure

Terraform for the software factory: an API that starts Dependabot project-manager agents (Bedrock) for each repository a GitHub App can access. Application code lives in [AlisterGreg/software-factory](https://github.com/AlisterGreg/software-factory).

## Layout

| Path | What it is |
|---|---|
| `*.tf` | Main stack: Lambdas, API Gateway, IAM, GitHub App key secret, log groups |
| `terraform.tfvars.example` | Inputs. Copy to `terraform.tfvars` (gitignored) |
| `src/`, `test/` | Lambda application code and unit tests (`npm test` equivalent: `node --test software-factory/test/*.test.mjs`) |

State is in the existing bucket `infrastructure-iac-agx-terraform-state` under the key `software-factory/terraform.tfstate`.

AWS access for the workflows uses the existing `AWS_ROLE_ARN` secret, the same role the root configuration uses. The Lambda code lives in `software-factory/src` and `software-factory/test`, and Terraform packages it from there. There is no separate app repo checkout.

## One-time setup

1. **GitHub App** (under AlisterGreg): Dependabot alerts (read), Issues (read and write), Metadata (read), Contents (read). Install it on the repositories to cover. Store its private key in AWS Secrets Manager (the Lambda reads it):

   ```bash
   aws secretsmanager put-secret-value --region eu-west-1 \
     --secret-id software-factory/github-app-private-key \
     --secret-string file://path/to/key.pem
   ```

2. **Projects v2 board** under AlisterGreg, with single-select fields `Priority` (Urgent, High, Medium, Low) and `Size` (XS, S, M, L, XL). Use its number as `project_number`.

3. **Repository settings** on this repo (Settings → Secrets and variables → Actions):

   | Kind | Name | Value |
   |---|---|---|
   | Variable | `SF_GITHUB_APP_ID` | GitHub App ID |
   | Variable | `SF_PROJECT_OWNER` | `AlisterGreg` |
   | Variable | `SF_PROJECT_NUMBER` | Projects v2 number |
   | Secret | `SF_FACTORY_KEY` | the shared GUID |

   The `production` environment (already used by the root apply workflow) requires approval for applies.

4. **Deploy:** merge a change under `software-factory/`. `software-factory-apply` runs after approval. Locally, `terraform apply` from this folder also works once `terraform.tfvars` is filled in.

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `software-factory-plan.yml` | PR touching `software-factory/**` | fmt, init, validate, plan |
| `software-factory-apply.yml` | Merged PR touching `software-factory/**`, or manual | plan and apply, behind `production` approval |

The root workflows (`terraform-plan.yml`, `terraform-apply.yml`, and the test and dry-run workflows) are unchanged and apply only the root configuration.

## Invoking the factory

```bash
curl -X POST "$(terraform output -raw run_url)" \
  -H "x-factory-key: $FACTORY_KEY" -H "content-type: application/json" \
  -d '{"repos": ["AlisterGreg/sandbox"]}'
```

Leave out `repos` to cover every accessible repository.

## Known issues

- The root `README.md` says the state bucket is `infrastructure-iac-terraform-state`, but `versions.tf` uses `infrastructure-iac-agx-terraform-state`. This stack follows `versions.tf`.
- The Projects v2 board may not be writable by a GitHub App on a personal account. If `board_errors` appears on created issues, the issues exist but are not on the board.
