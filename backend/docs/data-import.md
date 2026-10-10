# Approved evidence import

The initial adapter accepts JSON business exports. A trusted local operator maps actual organizer-approved records; the server does not guess field names or trust agent-supplied verification flags. Confirm organizer version/checksums separately: a self-created manifest is not proof of approval.

Example shape uses placeholders, not asserted Enterprise-Bench fields:

```json
{
  "datasetLabel": "ORGANIZER_PINNED_VERSION",
  "files": [{ "path": "pm_json_data/records.json", "sha256": "ACTUAL_FILE_SHA256" }],
  "records": [
    {
      "domain": "pm", "sourceId": "ACTUAL_ISSUE_ID",
      "path": "pm_json_data/records.json", "pointer": "/records/0", "idPointer": "/id",
      "links": [{ "domain": "crm", "sourceId": "ACTUAL_TICKET_ID", "pointer": "/linkedTicketId" }]
    },
    {
      "domain": "crm", "sourceId": "ACTUAL_TICKET_ID",
      "path": "pm_json_data/records.json", "pointer": "/records/1", "idPointer": "/id",
      "links": []
    }
  ]
}
```

`pointer` locates the record in its original file. `idPointer` and link pointers are relative to that record. Empty pointer selects the JSON value; `~0`/`~1` escapes are supported. A relationship is accepted only when the original value exactly equals the mapped target ID. Similar titles/components do not establish causation.

Before committing, importer verifies real-path root containment, no absolute/grader paths, file checksum, parse/pointer resolution, original ID equality, unique IDs, record bounds, and link targets. Every source is scoped to one project/organization. Runtime cannot edit imported evidence; duplicate IDs cannot silently replace an existing dataset.

Current limits: JSON only, 16,000-character record body, direct references only, max 20 related records in a request bundle. Native DevRev retrieval, binary extraction, component joins, ARR aggregation, and historical-clock analysis are pending. Show missing evidence when a supported direct relationship does not exist; never fabricate one.
