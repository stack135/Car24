# Car24 Travels - Coming Soon Page

A beautiful "Coming Soon" landing page for Car24 Travels self-drive car rental service.

## Features

- Clean and modern design
- Responsive layout for all devices
- Interactive car image slider
- Email notification signup
- Professional branding

## Tech Stack

**Frontend:**
- React.js
- CSS3
- React Hooks

## Project Structure

```
car24/
├── client/
│   ├── public/
│   └── src/
│       ├── Assets/
│       │   └── Car 24 logo.png
│       ├── components/
│       │   ├── CarSlider.js
│       │   └── CarSlider.css
│       ├── pages/
│       │   ├── ComingSoon.js
│       │   └── ComingSoon.css
│       ├── App.js
│       ├── App.css
│       ├── index.js
│       └── index.css
└── server/
    ├── models/
    ├── routes/
    ├── middleware/
    └── index.js
```

## Installation

1. Install dependencies:
```bash
cd client
npm install
```

2. Start the development server:
```bash
npm start
```

The app will run on http://localhost:3000

## Components

### ComingSoon Page
- Main landing page with "Coming Soon" message
- Logo display
- Feature highlights
- Email notification form
- Car slider showcase

### CarSlider Component
- Auto-playing image carousel
- Manual navigation controls
- Dot indicators
- Slide counter
- Smooth transitions

## Customization

To customize the car images, edit the `carImages` array in `client/src/pages/ComingSoon.js`:

```javascript
const carImages = [
  'your-image-url-1.jpg',
  'your-image-url-2.jpg',
  // Add more images...
];
```

## License

MIT

## Powered by

Stackenzo
