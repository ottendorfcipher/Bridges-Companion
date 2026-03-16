# Bridge Companion

> A Progressive Web App for Educational Content Management

Bridge Companion is an offline-first educational platform designed for delivering structured learning content. Built with React, TypeScript, and SQLite, it provides comprehensive access to educational materials, reference resources, and interactive learning modules—all accessible without an internet connection.

## Overview

This PWA combines rich educational content with a mobile-first design, following Apple Human Interface Guidelines for optimal usability on iOS, Android, and desktop browsers. The app features an embedded SQLite database, Firebase authentication, and a role-based admin system for content management.

## Key Features

### Core Functionality
- **Offline-First Architecture**: Full functionality without internet connection after initial installation
- **Rich Content Library**: Structured educational modules and learning resources
- **Accordion-Based Navigation**: Hierarchical content display optimized for quick scanning and cognitive load reduction
- **Reference Integration**: Distinctively styled reference materials with optional online links
- **Advanced Search**: Content discovery through tags, categories, and full-text search
- **Reading Paths**: Guided learning sequences for structured content progression

### User Management
- **Firebase Authentication**: Secure Google OAuth integration
- **Role-Based Access Control**: Admin, editor, viewer, and user roles with granular permissions
- **User Profiles**: Persistent user settings and preferences
- **Activity Logging**: Comprehensive audit trails for content changes and user actions

### Content Management
- **Admin Panel**: Role-gated interface for user and content management
- **Rich Text Editing**: TipTap-based WYSIWYG editor for content updates
- **Version Control**: Content versioning with changelog and rollback capabilities
- **Edit Mode**: In-place content editing with live preview
- **Language Guardrails**: Built-in tone and terminology validation

## Architecture

### Technology Stack
- **Frontend**: React 18 with TypeScript 5.3
- **Database**: SQLite via sql.js (WebAssembly)
- **Authentication**: Firebase Auth with Google OAuth
- **Data Store**: Firestore (user profiles, permissions, activity logs)
- **Build Tool**: Vite 5 with PWA plugin
- **Service Worker**: Workbox for offline caching
- **Rich Text**: TipTap editor for content management
- **Styling**: CSS Modules with HIG-compliant design tokens

### Project Structure

```
bridge-companion/
├── docs/                          # Comprehensive documentation
│   ├── getting-started/          # Quick start, Firebase setup, installation
│   ├── development/              # Build guide, database, design system
│   ├── architecture/             # System design, Layer 1 implementation
│   ├── admin/                    # Admin panel configuration
│   ├── deployment/               # GitHub and Firebase deployment
│   ├── content/                  # Content guidelines and templates
│   └── README.md                 # Documentation index
├── src/
│   ├── components/               # 30+ React components
│   │   ├── Admin/               # User management, activity logs, versioning
│   │   ├── Auth/                # Login screen, user profile
│   │   ├── Accordion/           # Collapsible content display
│   │   ├── ContentRenderer/     # Scripture parsing and rendering
│   │   └── ...                  # Navigation, search, editing components
│   ├── config/                   # Firebase configuration
│   ├── contexts/                 # Auth and edit mode contexts
│   ├── data/                     # Database schema and migrations
│   ├── hooks/                    # Custom React hooks (auth, database, permissions)
│   ├── styles/                   # Global styles and theme
│   ├── types/                    # TypeScript definitions
│   └── utils/                    # Database, auth, theme utilities
├── public/
│   ├── content.db               # SQLite database (not in repo)
│   ├── sql-wasm/                # SQLite WebAssembly files
│   └── [PWA assets]             # Icons, manifest, service worker
├── scripts/                      # Database seeding, admin setup
└── tests/                        # Test files (Vitest)

```

## Quick Start

### Prerequisites
- Node.js 18+ and npm 9+
- Firebase project with Authentication and Firestore enabled
- Google OAuth configured in Firebase Console

### Initial Setup

```bash
# Clone repository
git clone https://github.com/ottendorfcipher/bridge-companion.git
cd bridge-companion

# Install dependencies
npm install

# Configure Firebase
cp .env.example .env
# Add your Firebase credentials to .env

# Create database
npm run db:create
npm run seed

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### First-Time Admin Setup

```bash
# Sign in with Google at localhost:5173
# Get your Firebase UID from browser console: firebase.auth().currentUser.uid

# Create admin user in Firestore Console
# Collection: users
# Document ID: [your UID]
# Fields: { role: 'admin', status: 'active', permissions: [...] }

# Refresh app to see Admin panel
```

See [docs/admin/ADMIN_QUICKSTART.md](docs/admin/ADMIN_QUICKSTART.md) for detailed admin setup.

### For End Users

See [docs/getting-started/INSTALLATION.md](docs/getting-started/INSTALLATION.md) for step-by-step installation on mobile devices.

## Available Commands

### Development
```bash
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # TypeScript compilation + production build
npm run preview          # Preview production build locally
npm run lint             # ESLint with TypeScript rules
npm run type-check       # TypeScript type checking
npm test                 # Run Vitest test suite
```

### Database Management
```bash
npm run db:create        # Create new SQLite database with schema
npm run migrate          # Run database migrations
npm run seed             # Seed database with content
npm run db:rebuild       # Rebuild database from content files
```

### Admin & Deployment
```bash
npm run admin:init       # Initialize first admin user
npm run versions:init    # Initialize version control system
firebase deploy --only firestore:rules   # Deploy Firestore security rules
firebase deploy --only hosting           # Deploy PWA to Firebase Hosting
```

## Content Management

### Database-Driven Content
Content is stored in SQLite (`public/content.db`) with a structured schema supporting:
- Hierarchical organization (categories → sections → subsections)
- Scripture references with source attribution
- External links (videos, articles)
- Tags and metadata for search and discovery

### Admin Panel Features
- **User Management**: Assign roles and permissions
- **Edit Mode**: In-place content editing with rich text editor
- **Version Control**: Track changes with automatic changelog
- **Activity Logs**: Audit trail for all content modifications
- **Language Validation**: Automatic checks against tone guardrails

### Content Guidelines
All content must adhere to language guardrails defined in [docs/content/01-language-guardrails.md](docs/content/01-language-guardrails.md):
- Educational and dialogue-focused framing
- Prohibited terms: mission, conversion, apologetics (in public-facing content)
- Emphasis on learning over persuasion
- Respectful treatment of all faith traditions

## Documentation

Comprehensive documentation is available in the [docs/](docs/) directory:

- **[Getting Started](docs/getting-started/)** - Quick start, Firebase setup, installation
- **[Development](docs/development/)** - Build guide, database schema, design system
- **[Architecture](docs/architecture/)** - System design, architectural decisions
- **[Admin](docs/admin/)** - Admin panel setup, permissions, user management
- **[Deployment](docs/deployment/)** - Production deployment to Firebase
- **[Content](docs/content/)** - Layer 1 architecture, language guardrails, templates

See [docs/README.md](docs/README.md) for the complete documentation index.

## Design Philosophy

### User Experience Principles
- **Distributed Cognition**: Content structured to reduce cognitive load during learning and conversations
- **KLM-GOMS Optimization**: Minimized interactions for common tasks (Quick Reference tab, one-tap expand)
- **Progressive Disclosure**: Accordion pattern shows overview first, details on demand
- **NN/g Guidelines**: Clear navigation, immediate feedback, user control, consistency
- **Apple HIG Compliance**: Native iOS-like experience with 44pt touch targets, system fonts, familiar patterns

### Educational Framework
- **Structured Learning**: Organized content modules for progressive learning
- **Content Guidelines**: Tone and terminology guidelines maintain educational focus
- **Layer 1 Architecture**: Structured content hierarchy with clear learning paths
- **Multiple Entry Points**: Tags, search, reading paths, and navigation accommodate different learning styles

## Contributing

This project follows strict language and tone guidelines. Before contributing:
1. Review [docs/content/01-language-guardrails.md](docs/content/01-language-guardrails.md)
2. Check [docs/development/DESIGN_SYSTEM.md](docs/development/DESIGN_SYSTEM.md) for UI patterns
3. Ensure TypeScript types are properly defined
4. Run `npm run lint` and `npm run type-check` before committing

## Deployment

### Firebase Hosting
```bash
# Build production bundle
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

### Static Hosting (Netlify, Vercel)
The `dist/` folder can be deployed to any static hosting provider. Ensure:
- HTTPS is enabled (required for service workers)
- Environment variables are configured
- Firebase credentials are added to hosting provider

See [docs/deployment/GITHUB_SETUP.md](docs/deployment/GITHUB_SETUP.md) for CI/CD setup.

## License

Proprietary - For educational use only

## Support

For issues, questions, or contributions:
- Review documentation in [docs/](docs/)
- Check [docs/README.md](docs/README.md) for quick navigation
- Ensure Firebase is properly configured (see [docs/getting-started/FIREBASE_SETUP.md](docs/getting-started/FIREBASE_SETUP.md))
