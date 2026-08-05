# JMO Ancestry

Static browser interface for viewing a private family-tree JSON file.

This repo intentionally contains only sample data. Real family information belongs in the private `ancestry-family-data` repo.

The public app is also an AI-agent research cockpit: imported JSON can include a seed packet, normalized places, map-ready events, reviewable claims, and long-running research tasks.

## Use

1. Open the published webapp.
2. If starting fresh, click `Agent template` and give `family-template.json` to your AI agents.
3. Agents edit that JSON into a working `family.json` over time.
4. Click `Load data` and choose the updated JSON file.

The app reads the file locally in your browser. It does not upload private data anywhere.

## Rich Profiles

Person records can stay compact while still reading more like a life article:

```json
{
  "profile": {
    "summary": "Short newspaper-style life story assembled from confirmed findings.",
    "photos": [
      {
        "url": "https://example.com/photo.jpg",
        "caption": "Portrait from Ancestry",
        "credit": "Ancestry user upload"
      }
    ],
    "obituaries": [
      {
        "title": "Official obituary",
        "publication": "Funeral home or newspaper",
        "date": "2011",
        "url": "https://example.com/obituary"
      }
    ]
  }
}
```

If `profile.summary` is missing, the app generates a short readable story from facts and relationships. Sources, photos, and obituaries should link out instead of embedding large documents or images in the JSON.

## Agent Research Fields

Private family JSON can add these top-level fields:

- `project`: reusable seed story, privacy rules, research goal, and `agentInstructions`
- `places`: normalized locations with `{ id, name, coordinates: { lat, lng } }`
- `claims`: proposed or confirmed facts with `personId`, `text`, `status`, `confidence`, and `sources`
- `researchTasks`: open questions for agents to work over time

Person records can add `events` with `type`, `date`, `place`, `placeId`, `status`, and `sources`. The map uses `placeId` to draw confirmed or lead life paths without requiring private data to leave the browser.

`data/family-template.json` is the starter contract for agents. It explains how to seed the known family story, how to research safely, and how to update the same file that the user later loads back into the app.

## Local Preview

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
