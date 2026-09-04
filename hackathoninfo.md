WebMCP is an emerging open standard that lets websites expose structured tools agents can use directly. Instead of leaving agents to guess their way through your UI, you define exactly how they can use your app, so they complete tasks faster, more accurately, and more reliably.

The WebMCP Challenge invites you to build something we haven’t seen before: an app that becomes meaningfully better when people and their agents can use it together.

Why join
Explore what new experiences that become possible when web apps can be built for people and their agents.

Help shape an emerging open standard and the future of the agent-native web.

The top 10 submissions will each receive $3,000 in cash, one Codex Micro, ChatGPT Pro for one year, OpenAI merch, and additional prizes from challenge supporters, subject to the official rules.

Get started

Learn what WebMCP enables. Read the WebMCP specification and Chrome’s developer documentation to understand how websites can expose tools to AI agents.

Get inspired. Explore the WebMCP Showcase for examples of agent-native apps and ideas for what you could build, and read the WebMCP guide from OpenAI.

Build and deploy. Create a new WebMCP-enabled app or add WebMCP support to an existing one. Host it on ChatGPT Sites, Cloudflare, Vercel, Render, Netlify, Shopify, or any deployment platform you choose.

Test your app. Open your deployed app in ChatGPT’s in-app browser, which supports WebMCP out of the box. To test in Google Chrome, enable WebMCP using chrome://flags/#enable-webmcp-testing.

Requirements
What to Build
Build a WebMCP-powered web app that imagines and explores the future of the open web—where humans and agents can interact, collaborate, and create together.

What to Submit

Provide a working live URL that judges can access using ChatGPT’s in-app browser or Google Chrome with WebMCP enabled. 
You may host your application on ChatGPT Sites, Cloudflare, Vercel, Render, Netlify, or any other provider of your choice. You may also authenticate your application if you wish. If so, you can add the credentials on the Submission Form.
Text description that explains:
Why your use case is a strong fit for WebMCP 
How it creates a better user experience
Describe what people and agents can do together that was difficult or impossible before
Briefly explain how you implemented WebMCP
A demo video. A <3-minute public YouTube video showing a clear demo with audio that covers what you built and how you used WebMCP
URL to your public code repository (on GitHub, GitLab and Bitbucket) that must contain: 
All necessary source code, assets, and instructions required for the project to be functional
Must be open source by including an open source license file. This license should be detectable and visible at the top of the repository page (in the About section)  
Repositories should have the following:
document.modelContext.registerTool({

       name: "search_products",

       description: "Search the product catalog",

        inputSchema: { /* ... */ },

        execute: async (input) => { /* ... */ }

});

Check the Resources tab for WebMCP starter docs and the FAQ for eligibility, submission, and setup basics.


Judging Criteria
WebMCP Leverage
How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation?
Execution
Does the project deliver a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept?
Potential Impact
Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?
Creativity & Ambition
How creative and novel is the concept and does the project differ from existing concepts?


Resource:

Starter guidance
Start with the documentation and supporter resources below, then test your deployed app in ChatGPT’s in-app browser or Google Chrome with WebMCP enabled via chrome://flags/#enable-webmcp-testing.
Use starter templates and example apps for inspiration.

 
Documentation
webmachinelearning/webmcp on GitHub — Specification source, explainers, and open issues.

WebMCP developer documentation — official documentation from Google.

WebMCP origin trial — instructions for enabling WebMCP in Chrome.

WebMCP tool security guide — Guidance on prompt-injection risks and trust boundaries.

 
Resources from hackathon supporters
OpenAI
WebMCP Showcase — Explore examples of agent-native apps.

ChatGPT Sites — Build and host a site in ChatGPT.

Cloudflare
WebMCP overview — An introduction to WebMCP and its potential uses.

WebMCP on Browser Run — Documentation for working with WebMCP in Cloudflare Browser Run.

Coffee-store demo — A WebMCP-enabled commerce example.

Cloudflare challenge landing page — Explore Cloudflare’s WebMCP Challenge resources and examples.

WebMCP on Workers template — Start from Cloudflare’s WebMCP React template for Workers.

Cloudflare Pages / Workers — Deploy your project on Cloudflare.

Vercel
Storefront source code — Explore or build on an open-source storefront.

WebMCP implementation — See how WebMCP was added to an existing storefront.

Live storefront demo — Try the example app.

Vercel pricing — Review hosting plans.

Get $30 in build credits (first 1000 builders) - and use code OAIWEBMH-9E2F-MUT4
Shopify
Shopify WebMCP tools documentation — Add WebMCP tools to Shopify storefronts.

Agentic tools — Explore Shopify’s agent-focused developer tools, including the Catalog API.

Google Chrome
useWebMCPTool React hook — Add WebMCP tools to a React app.

WebMCP Explainer — Understand the API design and specification.

WebMCP with Angular — Use Angular’s native support to add WebMCP tools.

WebMCP evals — Test your WebMCP tools before you ship.

WebMCP developer documentation — Explore Google’s WebMCP developer documentation.

Debug WebMCP tools — Inspect and debug registered tools in Chrome DevTools.

Modern Web Guidance — Use the WebMCP skill when building with coding agents.

WebMCP demos — Explore example implementations for inspiration.

Render
Render Workflows — Build and run agent-ready workflows.

Workflows documentation — Implementation guidance for Render Workflows.

Starter templates — Templates for getting a project started.

Participant credits — Claim $50 in Render credits; initially available for up to 500 claims. Credits are valid for one year after being applied and can cover workspace costs, including plan fees, compute usage, and bandwidth.

Credits documentation — Learn how Render credits work and how to use them.

Netlify

Netlify — Create an account, publish your app, and get a live URL. Free to start.
Participant credits — The first 1,000 eligible builders to complete this form receive 3,000 Netlify credits each to build and run their app. Available to new and existing Netlify users.
Choose your path — Follow Netlify’s getting-started guide.

WebMCP starter — Copy a prompt and use an agent to build and deploy a full site on Netlify with Agent Runners.

 