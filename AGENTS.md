APP DEVELOPMENT RULES

1. DO NOT ADD AI
- Do not add AI, machine learning, LLMs, chatbots, AI agents, or AI-powered features to the app.
- Do not suggest AI features unless explicitly requested.
- Do not use an AI API or external AI service unless explicitly requested.

2. DO NOT OVER-ENGINEER
- Keep the implementation as simple as possible.
- Prefer straightforward, maintainable solutions over complex architectures.
- Do not add unnecessary abstractions, libraries, dependencies, services, components, or design patterns.
- Do not build features "for future use" unless explicitly requested.
- Do not refactor unrelated code.

3. DO ONLY WHAT IS ASKED
- Implement exactly the requested functionality and nothing more.
- Do not add extra features, settings, pages, animations, UI elements, or functionality unless explicitly requested.
- Do not change existing behavior unless the request requires it.
- If something is not specified, choose the simplest reasonable implementation.

4. PRESERVE EXISTING WORK
- Do not rewrite working code unnecessarily.
- Make the smallest changes needed to complete the request.
- Preserve existing functionality, styling, structure, and dependencies unless they need to change.
- Do not remove existing features unless explicitly requested.

5. BEFORE CHANGING CODE
- Understand the existing project structure and implementation first.
- Reuse existing components, utilities, and dependencies when appropriate.
- Do not introduce a new library when the existing stack can accomplish the task.

6. CODE QUALITY
- Write clean, readable, practical code.
- Avoid unnecessary comments and documentation.
- Do not create placeholder code, mock functionality, or fake implementations unless explicitly requested.
- Fix the actual problem rather than masking symptoms.

7. SCOPE CONTROL
- Treat every request as narrowly scoped.
- If a requested change can be completed with 10 lines of code, do not turn it into 100 lines.
- Do not make unrelated improvements while working on a requested feature.
- Do not "improve" things that were not asked to be improved.

8. FOLLOW USER INSTRUCTIONS OVER YOUR OWN PREFERENCES
- The user's explicit requirements take priority over your assumptions about how the app should work.
- Do not silently change requirements.
- When requirements are ambiguous and the ambiguity materially affects implementation, ask before making a major architectural decision.

CORE RULE:
KEEP IT SIMPLE. NO AI. NO EXTRA FEATURES. NO UNNECESSARY CHANGES. DO EXACTLY WHAT THE USER REQUESTS.