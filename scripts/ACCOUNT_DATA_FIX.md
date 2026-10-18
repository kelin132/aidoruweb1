# Account collection regression checks

With Node.js 24, run:

```sh
node --test scripts/user-identity.test.ts scripts/collection-data.test.ts
npm run build
```

The tests use fixture accounts and database mocks, never production data.
They cover verified phone/LID aliases, legacy migration metadata, a 60-Pokémon
profile (including complete party and PC collections), and cards stored under
both legacy and canonical account keys. Separate copies of the same card
character are retained.

The website no longer limits profile Pokémon queries to 36 documents or
selects only the first matching card-owner document. Deploy the paired bot
identity fix so future commands retain existing account keys and website IDs.
If no verified mapping exists for an old privacy LID, interacting with the bot
allows it to record the mapping supplied by WhatsApp. No LID is treated as a
phone number by guessing its numeric value.

These changes do not drop indexes, reset collections, or rewrite account IDs.
Live database contents and panel/deployment configuration require separate
runtime verification after deployment.
