# Architecture Documentation

## System Overview

Bridge Companion is a Progressive Web App (PWA) that prioritizes offline functionality, mobile-first design, and rapid content access. The architecture follows a client-side-only model with embedded SQLite database.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  User's Device                      │
│                                                     │
│  ┌───────────────────────────────────────────┐   │
│  │         React Application Layer           │   │
│  │  ┌─────────────────────────────────────┐ │   │
│  │  │      UI Components (HIG)            │ │   │
│  │  │  - TabBar Navigation                │ │   │
│  │  │  - Accordion Views                  │ │   │
│  │  │  - Scripture Callouts               │ │   │
│  │  └─────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────┐ │   │
│  │  │      Business Logic Layer           │ │   │
│  │  │  - Content Filtering                │ │   │
│  │  │  - State Management                 │ │   │
│  │  │  - Navigation Logic                 │ │   │
│  │  └─────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────┐ │   │
│  │  │      Data Access Layer              │ │   │
│  │  │  - SQLite Interface (sql.js)        │ │   │
│  │  │  - Query Helpers                    │ │   │
│  │  │  - Content Parsers                  │ │   │
│  │  └─────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────┐   │
│  │         Service Worker (Workbox)          │   │
│  │  - Cache-First Strategy                   │   │
│  │  - Offline Fallback                       │   │
│  │  - Asset Preloading                       │   │
│  └───────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────┐   │
│  │         Embedded SQLite Database          │   │
│  │  - Content Tables                         │   │
│  │  - Relationships                          │   │
│  │  - Indexed for Fast Queries               │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. Client-Side SQLite via sql.js

**Decision**: Use sql.js (SQLite compiled to WebAssembly) instead of IndexedDB or local storage.

**Rationale**:
- Allows complex relational queries for content retrieval
- Developer-friendly SQL interface for content updates
- Better structure for future content management tools
- Familiar paradigm for database-savvy developers

**Trade-offs**:
- Larger initial download (~1MB for sql.js)
- Database loaded into memory
- Mitigated by: Service worker caching, acceptable for content size

### 2. Progressive Web App (PWA)

**Decision**: Build as installable PWA rather than native app or standard web app.

**Rationale**:
- True offline functionality via service workers
- Cross-platform (iOS, Android, desktop)
- No app store approval process
- Easy deployment and updates
- Installable to home screen (key requirement)

**Implementation**:
- Workbox for service worker generation
- Manifest.json for installation prompts
- Cache-first strategy for all assets
- Background sync for future enhancements

### 3. React + TypeScript

**Decision**: Use React with TypeScript instead of vanilla JS or other frameworks.

**Rationale**:
- Component reusability matches HIG patterns
- TypeScript prevents common errors in content rendering
- Strong ecosystem for mobile web development
- Developer familiarity and hiring pool

**Structure**:
- Functional components with hooks
- Context API for global state (tab navigation, theme)
- No external state management library needed (keeps bundle small)

### 4. Accordion-Based Content Display

**Decision**: Primary content display uses accordion pattern.

**Rationale**:
- Aligns with distributed cognition principles (show overview, reveal details)
- Reduces scrolling distance (KLM-GOMS optimization)
- Matches iOS native patterns (HIG compliance)
- Enables quick scanning of topics

**Implementation**:
- Native HTML details/summary elements for accessibility
- Enhanced with React for state management
- Animated transitions following HIG motion guidelines

### 5. Two-Tier Navigation

**Decision**: Tab bar + accordion navigation structure.

**Rationale**:
- Tab bar provides immediate access to major sections (≤5 tabs per HIG)
- Accordion provides hierarchical drilling within sections
- "Quick Reference" tab always accessible (addresses primary use case)
- Minimizes navigation depth (typically 2 levels maximum)

## Data Flow

### Content Rendering Flow

```
User Action (Tap Tab) 
    ↓
Navigation State Update
    ↓
Component Re-render
    ↓
SQL Query Execution (useDatabase hook)
    ↓
Content Parsing (Scripture styling, links)
    ↓
Accordion Rendering
    ↓
User Interaction (Expand/Collapse)
```

### Offline-First Flow

```
Initial Visit:
Browser → Fetch Assets → Service Worker Intercepts → Cache Assets → Display App

Subsequent Visits:
Browser → Service Worker → Return Cached Assets → Display App (No Network)

Database Loading:
App Start → Load sql.js → Load .db file from cache → Initialize DB → Ready
```

## Performance Considerations

### Critical Performance Metrics

Following NN/g guidelines for mobile usability:

- **Time to Interactive**: < 3 seconds on 3G
- **First Contentful Paint**: < 1.5 seconds
- **Accordion Expand**: < 100ms (perceived as instant)
- **Tab Switch**: < 200ms
- **Database Query**: < 50ms for typical content fetch

### Optimization Strategies

1. **Code Splitting**: 
   - Tab content loaded on-demand
   - sql.js loaded asynchronously after UI renders

2. **Asset Optimization**:
   - Minified CSS and JS
   - Compressed images (WebP with fallbacks)
   - Tree-shaking unused code

3. **Database Optimization**:
   - Indexed columns for common queries
   - Denormalized content where appropriate
   - Pre-parsed content stored in DB (no runtime markdown parsing)

4. **Rendering Optimization**:
   - React.memo for accordion items
   - Virtual scrolling if content exceeds reasonable length
   - Lazy loading of scripture link lookups

## Accessibility

While not primary requirement, basic accessibility maintained:

- Semantic HTML elements
- ARIA labels for icon-only buttons
- Sufficient color contrast (4.5:1 minimum)
- Touch targets ≥44x44pt (HIG requirement)
- Focus indicators for keyboard navigation

## Security Considerations

- No authentication required (read-only content)
- No user data collection
- No external API calls (except scripture links when online)
- Content Security Policy prevents injection attacks
- HTTPS required for service worker registration

## Future Extensibility

Architecture designed to accommodate:

1. **Content Management Tool**:
   - Same SQLite schema
   - Export/import .db file
   - Validation layer for content structure

2. **Synchronization** (if needed):
   - Version checking via manifest
   - Background sync for updated .db file
   - User notification of new content

3. **Analytics** (if approved):
   - Event hooks already in place
   - Privacy-conscious implementation possible
   - Opt-in only

4. **Enhanced Features**:
   - Bookmarking (localStorage layer)
   - Notes (separate table in SQLite)
   - Sharing (Web Share API)

## Testing Strategy

- **Unit Tests**: Critical utilities and parsers
- **Integration Tests**: Database queries and content rendering
- **E2E Tests**: Core user flows (Playwright)
- **Manual Testing**: Actual devices (iPhone SE, iPhone 14, Android)
- **Offline Testing**: Service worker functionality
- **Performance Testing**: Lighthouse CI for regressions

## Deployment

Simple static hosting:
- Build output to `/dist`
- Host on Netlify/Vercel/GitHub Pages
- HTTPS automatic
- No backend required
- QR code generation for easy distribution

## Monitoring

Minimal monitoring via:
- Lighthouse scores tracked per build
- Bundle size tracking
- No user analytics (privacy-first)
