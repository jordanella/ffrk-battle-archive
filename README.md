# FFRK Battle Archive

A browsable record of the battles in **FINAL FANTASY Record Keeper**: every event, dungeon and encounter we have data for, with each enemy's stats, resistances, moves, AI and animations.

**Browse it:** https://jordanella.github.io/ffrk-battle-archive/

This is an unofficial fan project and is not affiliated with DeNA or SQUARE ENIX. FINAL FANTASY Record Keeper and everything in it belong to their owners.

## The rule: all derivable data, no assets

The archive publishes **facts about the game**, never the game's own files:

- **Included:** structure, numbers, names, timings and how things move.
- **Not included:** pictures, sprites, sounds, music, or code.

Where a fact refers to a game file, such as a sound effect or a texture, the archive gives the file's **name and path** and stops there.

## What's in it

Each level of the browser narrows down: **event type → category → location → encounter → enemy**.

- **Encounters.** Each round's enemies, its music file, and the round **staged** on its battle field. The background, enemies and party slots are drawn as coloured, labelled boxes, placed where the game's own placement rules put them.
- **Enemies.** Each enemy page has these tabs:
  - **Overview:** stats per form, resistances, and every move decoded, with its weights, cast time, targeting and arguments.
  - **AI:** its logic as flowcharts.
  - **Write-up:** a summary in the notation players used for boss write-ups.
  - **Animation:** the animation files it uses, the animations each contains, and the sound effects each one plays.
- **Player skills** (`#/skills`). Soul breaks, burst and brave commands, abilities and magicite skills, by realm and character. Each links to its animation's phases (launch, shot, hit …) in the motion player.
- **Motion library** (`#/motion`). Every animation file the battles and the player skills use, rewritten as a **motion score**: a documented, picture-free format. The site plays each score as moving boxes, with a timeline, event markers and a dope sheet.
- **Capture wish-list** (`#/wishlist`). What a capture would add: story battles whose rounds haven't been captured, AI scripts no archive holds, and any game files the battles name that are missing from this collection.

Every record carries a **provenance badge**:

| Badge | Meaning |
|---|---|
| captured | as the game's server sent it (including 2015 captures published by the recordpeeker project) |
| realm | a story dungeon laid out from the r/FFRecordKeeper wiki's dungeon pages. Where no source gives a battle's rounds, the record says so and lists the dungeon's monsters instead: nothing is guessed. |
| rebuilt | reconstructed from players' public write-ups, not directly datamined |

## How it loads

The site has no build step and no server: it is static files, and each page fetches only the small JSON files it needs.

| Page | Fetches | Typical size, as served |
|---|---|---|
| first visit | `data/index.json` | ~130 KB |
| an encounter | `data/battles/<id>.json` | ~3 KB |
| a staged round, or a motion player page | the motion scores it draws, one file each | ~1 KB each, rarely over 200 KB |
| player skills | `data/skills/<kind>.json` | 100–400 KB |
| an AI chart | `data/ai/<id>.json` | under 1 KB |

GitHub Pages compresses everything it sends, so these sizes are what visitors download. Motion scores are stored gzipped (`<score>.json.gz`, about an eighth of their size; GitHub Pages caps a site at 1 GB) and the page inflates each one as it loads it. Nobody downloads the whole archive to look at one battle. Cloning the repository does fetch everything: about 170 MB on disk, much less over the wire.

## The data, for re-use

All of it is plain JSON under `data/`:

| Path | What |
|---|---|
| `index.json` | events, categories, realms, dungeons and the battles in each |
| `battles/<battle id>.json` | one encounter: rounds, enemy groups and their field slots, enemies (forms, stats, resistances, moves decoded, AI settings, animation files, sounds), stage (background, field, music) |
| `ai/<ai id>.json` | one AI script as flowchart data |
| `enemies.json` | enemy name → the battles it appears in |
| `motion/index.json` | every motion score: source path, kind, counts |
| `motion/<game path>.json.gz` | one motion score, gzipped JSON |
| `skills/index.json`, `skills/<kind>.json` | player skills by kind: name, owner, realm, tier, ability id, animation id and its phase files |
| `wishlist.json` | what is still to be captured: uncaptured battles by dungeon, missing AI scripts, missing game files |

## Run it locally

```sh
python -m http.server 8000
# then open http://127.0.0.1:8000/
```

The site needs to be served over HTTP; opening `index.html` straight from disk won't load the data.

## Sources

- The r/FFRecordKeeper wiki's dungeon pages: https://www.reddit.com/r/FFRecordKeeper/wiki/index/dungeons/
- Players' public boss write-ups on r/FFRecordKeeper. Each rebuilt battle names the post and section it came from.
- The recordpeeker project's 2015 captures: https://github.com/mdbarney/recordpeeker
- The Japanese wiki at gamematome, for post-Global enemy lineups: https://xn--ffrk-8i9hs14f.gamematome.jp/game/780/wiki/
- Public spreadsheets, for the player skills: a datamined sheet of skill definitions (names, owners, ability and animation ids): https://docs.google.com/spreadsheets/d/1NrrlNJKeStKD4qmD-liAPg5Ow6wzMGWpBTa2ycMPYNs, and a database sheet for realms and tiers: https://docs.google.com/spreadsheets/d/1f8OJIQhpycljDQ8QNDk_va1GJ1u7RVoMaNjFcHH0LKk

## Contributing

The data here is generated. Corrections and new captures should not be submitted as direct edits to these files. Please open an issue describing what's wrong or missing; the capture wish-list shows what would help most.
