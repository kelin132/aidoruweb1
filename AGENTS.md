<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Guild Wars use isolated `web_guild_wars` MongoDB documents and existing custom session authentication; this preserves the bot's guild schema.
- Guild-war scores come only from persisted Pokémon battle winners, with transactional idempotent recording; client-submitted scores are never trusted.
- War phases advance on authenticated reads and actions using persisted deadlines; this avoids dependence on process-local timers.
