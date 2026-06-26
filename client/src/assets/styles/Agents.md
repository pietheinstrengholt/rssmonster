# AGENTS.md

## Purpose

This folder contains the shared visual design system for RSSMonster.

`theme.css` defines the global color language, surface hierarchy, button colors, badge colors, dark mode colors and reusable CSS variables.

When editing files in this folder, preserve the existing RSSMonster design direction:

* clean
* calm
* professional
* reading-focused
* modern SaaS feel
* low visual noise
* accessible contrast
* consistent semantic color usage

The design should feel closer to GitHub, Linear, Notion and Vercel than to a colorful dashboard.

---

# Core Design Intent

RSSMonster is a professional RSS reader. The interface should support long reading sessions and fast scanning of articles.

Colors should communicate meaning, not decoration.

Use the following semantic rules:

| Color Family | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| Blue         | navigation, selected state, links, primary actions, similar articles, sentiment |
| Orange       | refresh, attention, advertisement score, important utility actions              |
| Green        | positive actions, AI/smart actions, writing quality                             |
| Red          | quality warnings or negative quality signals                                    |
| Purple       | rules, automation, smart folders, tag rules                                     |
| Gray         | metadata, tags, neutral information, secondary UI                               |

Do not introduce new accent colors unless explicitly requested.

---

# General CSS Rules

* Prefer CSS variables over hard-coded colors.
* Do not duplicate colors across components when a shared variable already exists.
* Preserve existing comments.
* Preserve existing spacing, sizing, border radius, layout and typography unless the task explicitly asks to change them.
* Keep color changes scoped and intentional.
* Use compact, readable CSS.
* Avoid unnecessary wrappers or extra classes unless they improve maintainability.
* Do not use `!important` unless there is no reasonable alternative.
* Avoid pure black `#000000` and pure white surfaces in dark mode.
* Dark mode must be designed, not inverted.
* Ensure normal text meets WCAG AA contrast.

---

# Light Theme Palette

## Base Surfaces

```css
--bg-sidebar: #F8F9FA;
--bg-toolbar: #FEFEFE;
--bg-menu-item: #F3F4F6;
--bg-selected-soft: #E8F2FE;
--bg-page: #FFFFFF;
--bg-card: #FFFFFF;
```

## Text

```css
--text-primary: #111827;
--text-meta: #6B7280;
--text-secondary: #4B5563;
```

## Blue / Primary

```css
--color-primary: #2563EB;
--color-primary-hover: #1D4ED8;
--color-primary-active: #1E3A8A;
--color-primary-visited: #1E40AF;
--color-primary-soft: #E8F2FE;
--color-primary-text: #1D4ED8;
```

## Orange / Attention

```css
--color-orange: #EA650D;
--color-orange-hover-text: #C2410C;
--color-orange-soft: #FFF1E8;
--color-orange-soft-hover: #FFE6D5;
--color-orange-border: #FFC4A3;
```

## Green / Positive

```css
--color-green: #166534;
--color-green-hover-text: #14532D;
--color-green-soft: #EAF7EF;
--color-green-soft-hover: #DDF2E5;
--color-green-border: #B9DFC6;
```

---

# Sidebar Buttons

## Fresh Feeds

```css
background: #2563EB;
hover-background: #1D4ED8;
border: none;
color: #FFFFFF;
```

## Add New Feed

```css
background: #FFF1E8;
hover-background: #FFE6D5;
border: #FFC4A3;
color: #EA650D;
hover-color: #C2410C;
```

## Mark as Read

```css
background: #EAF7EF;
hover-background: #DDF2E5;
border: #B9DFC6;
color: #166534;
hover-color: #14532D;
```

---

# Article / Settings Badge Colors

These badge colors are also used in settings pages. Treat them as semantic colors, not article-only colors.

## Light Mode

```css
/* Similar Articles */
--badge-similar-bg: #E8F2FE;
--badge-similar-text: #1D4ED8;

/* Tags */
--badge-tag-bg: #F3F4F6;
--badge-tag-text: #4B5563;

/* Quality */
--badge-quality-bg: #FEE2E2;
--badge-quality-text: #B91C1C;

/* Ad Score */
--badge-ad-bg: #FFEDD5;
--badge-ad-text: #EA650D;

/* Sentiment */
--badge-sentiment-bg: #E8ECFC;
--badge-sentiment-text: #1D4ED8;

/* Writing */
--badge-writing-bg: #E6F4EA;
--badge-writing-text: #1F5E3A;

/* Tag Rule */
--badge-tag-rule-bg: #F3E8FF;
--badge-tag-rule-text: #7C3AED;
```

## Dark Mode

```css
/* Similar Articles */
--badge-similar-bg: #1E3A8A;
--badge-similar-text: #93C5FD;

/* Tags */
--badge-tag-bg: #2A2F3A;
--badge-tag-text: #D1D5DB;

/* Quality */
--badge-quality-bg: #7F1D1D;
--badge-quality-text: #FCA5A5;

/* Ad Score */
--badge-ad-bg: #7C2D12;
--badge-ad-text: #FDBA74;

/* Sentiment */
--badge-sentiment-bg: #1E2A78;
--badge-sentiment-text: #A5B4FC;

/* Writing */
--badge-writing-bg: #14532D;
--badge-writing-text: #86EFAC;

/* Tag Rule */
--badge-tag-rule-bg: #3B1D6E;
--badge-tag-rule-text: #C4B5FD;
```

---

# Dark Theme Palette

Dark mode should use layered surfaces.

```css
--dark-bg-page: #0B0F14;
--dark-bg-sidebar: #11161D;
--dark-bg-toolbar: #161C24;
--dark-bg-card: #1A202C;
--dark-bg-hover: #222836;
--dark-border: #2A3342;

--dark-text-primary: #E5E7EB;
--dark-text-body: #D1D5DB;
--dark-text-meta: #9CA3AF;
--dark-text-muted: #6B7280;
```

## Dark Sidebar Selected State

```css
background: #1E3A8A;
color: #FFFFFF;
icon-color: #FFFFFF;
```

## Dark Hyperlinks

```css
--color-link: #60A5FA;
--color-link-hover: #93C5FD;
--color-link-visited: #3B82F6;
--color-link-active: #2563EB;
```

---

# Dark Sidebar Buttons

## Fresh Feeds

Keep the primary blue consistent across light and dark mode.

```css
background: #2563EB;
hover-background: #1D4ED8;
border: none;
color: #FFFFFF;
```

## Add New Feed

```css
background: #3A2A21;
hover-background: #4A3428;
border: #7A4D38;
color: #EA650D;
hover-color: #FFBE9D;
```

## Mark as Read

```css
background: #1E3D2B;
hover-background: #274F36;
border: #3A7A55;
color: #4ADE80;
hover-color: #D1FAE5;
```

---

# Implementation Guidance

When adding or changing styles:

1. First check whether a suitable variable already exists.
2. If a new color is needed, add it as a semantic variable.
3. Do not hard-code badge colors in Vue components.
4. Do not create component-specific color systems unless the component has a truly unique semantic role.
5. Keep light and dark variables paired.
6. In dark mode, prefer darker backgrounds with brighter text.
7. Badges should be quieter than buttons.
8. Buttons should clearly read as interactive.
9. Metadata should never compete with article titles.
10. Article text should remain comfortable for long reading sessions.

---

# Expected Result

The UI should feel consistent across:

* article list
* article cards
* sidebar
* desktop toolbar
* mobile toolbar
* settings pages
* smart folders
* feeds overview
* scores settings
* actions settings
* dialogs
* badges
* buttons
* empty states

The dark theme should feel like a native, polished dark UI rather than an inverted light theme.