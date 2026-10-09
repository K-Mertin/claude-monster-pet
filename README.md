# Claude Monster Pet

A Claude Code mod that hatches a pixel-art digital monster and raises it from your work. Tokens feed it, passing tests and commits cheer it up, failed commands stress it, and the way you work decides what it evolves into.

## Install

In a Claude Code terminal session (Claude Code 2.1.287 or later):

```
/plugin install monster --marketplace OWNER/claude-monster-pet
```

Answer `y` to add the marketplace, then pick a scope. The egg appears above your prompt.

## Use

- The band above the prompt shows your monster with its food, joy and XP bars.
- `/pet` opens its habitat, with **Feed**, **Play** and **Pat** buttons.
- `/pet feed`, `/pet play`, `/pet name <name>`, `/pet hide`, `/pet show`

## How it grows

| Your work | Effect |
| --- | --- |
| Tokens Claude processes | Food and XP |
| Passing test runs, git commits, finished todo items | Joy and XP |
| Failed or denied commands | Stress; too much makes it sick, and it recovers over time |
| Hours away | It gets hungry and sleeps. It never dies. |

Stages: egg → baby (Lv 1) → child (Lv 4) → adult (Lv 10) → ultimate (Lv 20).

At the child stage it picks an evolution line from how you have worked:

- **Forge**: mostly shell commands. Horns and a flame tail.
- **Scribe**: mostly reading and editing code. A floating ghost with a quill.
- **Summoner**: many subagents. Big ears.
- **Wanderer**: lots of web research. Wings and a beak.

There is one monster per machine, shared by every session, saved in `~/.claude/monster/pet.json`. The mod makes no model calls and no network requests.

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
