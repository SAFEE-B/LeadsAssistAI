# Lead Generation Frontend

This is the React frontend for the Lead Generation System. It provides a modern, responsive user interface for managing lead generation requests, monitoring job queues, and downloading completed deliveries.

## Features

### 🔑 Authentication
- User login and registration
- Protected routes with JWT authentication
- Automatic token refresh and logout handling

### 🤖 LLM Chat Interface
- Interactive chat with AI assistant for lead generation requests
- Natural language processing for business queries
- Action buttons for quick lead searches and scraping jobs
- Real-time conversation flow

### 📊 Queue Monitoring
- Real-time queue statistics (scraper and processing queues)
- Live job status updates
- Job progress tracking
- Auto-refresh functionality

### 📦 Deliveries & Downloads
- View completed lead generation jobs
- Download generated Excel/CSV files
- Search and filter deliveries
- Summary statistics and success rates

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Backend server running on port 3000

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm start
   ```

3. **Access the application:**
   Open [http://localhost:3001](http://localhost:3001) in your browser

### Environment Variables

Create a `.env` file in the frontend directory:

```env
REACT_APP_API_URL=http://localhost:3000
```

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Launches the test runner
- `npm run eject` - Ejects from Create React App (irreversible)

## Project Structure

```
frontend/
├── public/
│   ├── index.html
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── Auth.css
│   │   ├── Chat.css
│   │   ├── Chat.js
│   │   ├── Deliveries.css
│   │   ├── Deliveries.js
│   │   ├── LoadingSpinner.css
│   │   ├── LoadingSpinner.js
│   │   ├── Login.js
│   │   ├── Queue.css
│   │   ├── Queue.js
│   │   └── Signup.js
│   ├── utils/
│   │   └── api.js
│   ├── App.css
│   ├── App.js
│   ├── index.css
│   └── index.js
└── package.json
```

## Key Components

### Chat Component
- Main interface for interacting with the LLM
- Handles conversation flow and action buttons
- Displays lead previews and job confirmations

### Queue Component
- Shows real-time queue statistics
- Displays active and recent jobs
- Auto-refreshes every 10 seconds

### Deliveries Component
- Lists completed jobs with download options
- Search and filter functionality
- Summary statistics

### Authentication Components
- Login and signup forms
- Token management
- Protected route handling

## API Integration

The frontend communicates with the backend API through:
- `/api/auth/*` - Authentication endpoints
- `/api/conversation/chat` - LLM chat interface
- `/api/scraper/*` - Job management
- `/api/status/queues` - Queue monitoring
- `/api/delivery/*` - Completed deliveries
- `/api/files/*` - File downloads

## Styling

The application uses:
- Modern CSS with CSS Grid and Flexbox
- Responsive design for mobile and desktop
- Custom color scheme and animations
- Consistent component styling

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see the LICENSE file for details 