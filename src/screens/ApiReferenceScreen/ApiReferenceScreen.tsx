import { Section } from '../../../lib/ui/Section/Section'
import styles from './ApiReferenceScreen.module.scss'

const workerActions = [
  {
    action: 'claim_next_work_item',
    fields: 'backlogId, workerId, workerDisplayName, workerCapabilities, leaseSeconds',
    result: 'Returns a leaseToken and the claimed work item, or null when no ready item exists.'
  },
  {
    action: 'heartbeat_lease',
    fields: 'leaseToken, leaseSeconds',
    result: 'Extends the active lease and records a heartbeat event.'
  },
  {
    action: 'release_lease',
    fields: 'leaseToken, reason',
    result: 'Releases the task back to Ready.'
  },
  {
    action: 'complete_work_item',
    fields: 'leaseToken, resultSummary, resultUrl',
    result: 'Moves the task to Review and records the result.'
  },
  {
    action: 'fail_work_item',
    fields: 'leaseToken, errorSummary',
    result: 'Moves the task to Blocked and records the failure.'
  }
]

export const ApiReferenceScreen = () => (
  <section className={styles.screen} aria-labelledby="api-title">
    <header className={styles.header}>
      <p>Worker API</p>
      <h2 id="api-title">Claim contract</h2>
    </header>

    <Section title="Endpoint">
      <div className={styles.endpoint}>
        <code>POST /functions/v1/worker</code>
        <p>Use a Supabase bearer token for a team member, or the local development <code>x-worker-secret</code> fallback.</p>
      </div>
    </Section>

    <Section title="Duplicate prevention">
      <p className={styles.copy}>
        Workers never choose tasks directly. They call the claim action for a specific backlog, and Postgres selects exactly one ready item inside a transaction using row locking and an active lease constraint. Team membership is enforced for bearer-authenticated workers. Every mutating worker action requires the lease token.
      </p>
    </Section>

    <Section title="Actions">
      <div className={styles.actions}>
        {workerActions.map((action) => (
          <article key={action.action}>
            <h3>{action.action}</h3>
            <dl>
              <div>
                <dt>Fields</dt>
                <dd>{action.fields}</dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>{action.result}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Section>

    <Section title="Example">
      <pre className={styles.code}>{`curl -s http://192.x.x.x:54321/functions/v1/worker \\
  -H 'content-type: application/json' \\
  -H 'x-worker-secret: local-dev-worker-secret' \\
  -d '{
    "action": "claim_next_work_item",
    "backlogId": "backlog-uuid",
    "workerId": "daedalus",
    "workerDisplayName": "Daedalus",
    "workerCapabilities": ["code", "github"],
    "leaseSeconds": 1800
  }'`}</pre>
    </Section>
  </section>
)
