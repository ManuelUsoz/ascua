# Chat feature

Ascua will have a chat feature. In the project view users will see a new tab calls Chats. If no provider is configure,
we do an onboarding to set the provider. Setting the provider is reusing the login from the current provider (we are
goin to support only one for the mvp)

## Domain

- Domain package is what renderer understands and what desktop app returns to the renderer.

## Sdks/ACP

- This lives inside the desktop electron app. For claude, we use agent sdks.

## We will create a harness layer

- Currently we are using the nxy.dev plugin in claude. We want to do it in ascua harness. What we want from that harness
  - nxy locate for searching through files
  - nxy feature and nxy workflow for bug fixing and feature (we can rename it into nxy make)
  - nxy review for reviewing individual files, prs that are not from the user (things that does not require a plan)

## In clean

Renderer sends the prompt messages domain model and receives the responses and events
Desktop talks to the sdks and holds the context sdks (current context which routes based on the selected provider)
Desktop saves the sessions for persistence, memories, etc. (like the plugin does)
Desktop sends signals on every response from the sdks with subscriber pattern for modules to subscribe (For example notifications, alerts inside the app, push notifications etc.)
