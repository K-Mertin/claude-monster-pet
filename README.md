# Claude Monster Pet

A Claude Code mod that hatches a pixel-art digital monster and raises it from your work. Tokens feed it, passing tests and commits cheer it up, failed commands stress it, and the way you work decides what it evolves into.

## Install

In a Claude Code terminal session (Claude Code 2.1.287 or later):

```
/plugin install monster --marketplace K-Mertin/claude-monster-pet
```

Answer `y` to add the marketplace, then pick a scope. The egg appears above your prompt.

## Use

- The band above the prompt shows your monster with its food, joy, energy and XP, plus what it is up to.
- `/pet` opens its habitat, with five tabs:
  - **Home**: Feed, Play, Pat, Talk, Clean (after meals it makes a mess), Tuck in (it sleeps and recovers)
  - **Items**: treats earned from your work, each with its own effect
  - **Games**: a three-round treat hunt with prizes, and training for Power, Wisdom and Speed
  - **Style**: hats unlocked by badges
  - **Badges**: 18 achievements, each announced with a toast
- Commands: `/pet feed|play|talk|clean|tuck`, `/pet use cookie|coffee|gem|bug`, `/pet train power|wisdom|speed`, `/pet hat <hat>|none`, `/pet name <name>`, `/pet hide|show`

## How it grows

| Your work | Effect |
| --- | --- |
| Tokens Claude processes | Food and XP; a ☕ coffee every 50k tokens |
| Passing test runs | Joy, XP and a 🍪 cookie; a 🐛 bug snack when a failing test passes again |
| Git commits and pushes | Joy, XP and a 💎 gem |
| Finished todo items | Joy and XP |
| New subagents | It waves at them |
| Failed or denied commands | Stress; too much makes it sick, and it recovers over time |
| A new day of work | A daily gift and a growing streak, with gems at 3, 7 and 30 days |
| Hours away | It gets hungry and sleeps. It never dies. |

Stages: egg → baby (Lv 1) → child (Lv 4) → adult (Lv 10) → ultimate (Lv 20).

At the child stage it picks an evolution line from how you have worked:

| Line | When | Looks | Adult (bright / shadow) | Ultimate (bright / shadow) |
| --- | --- | --- | --- | --- |
| Forge | mostly shell commands | horns, flame tail | Emberkin / Cinderhorn | Solforge / Ashtyrant |
| Scribe | mostly reading and editing code | a floating ghost with a quill | Quillwisp / Inkshade | Lorewraith / Hexscript |
| Summoner | many subagents | big ears | Callpup / Hollowear | Choirlord / Legionmaw |
| Wanderer | lots of web research | wings and a beak | Skylark / Duskwing | Zephyrus / Stormcrow |

How well you care for it decides whether its adult form is bright or shadow. Each monster also hatches with a personality (cheerful, lazy, curious or grumpy) that colors what it says.

There is one monster per machine, shared by every session, saved in `~/.claude/monster/pet.json`. The mod makes no model calls and no network requests.

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
