# Frontend Demo Guide

## Quick Start Instructions

### 1. Start the Backend Server
First, make sure your backend is running:
```powershell
# In the main project directory
npm start
```
This should start the backend on `http://localhost:3000`

### 2. Start the Frontend Server
Open a new terminal window and start the React frontend:
```powershell
# Navigate to frontend directory
cd frontend

# Start the React development server
npm start
```
This will start the frontend on `http://localhost:3001` (or the next available port)

### 3. Access the Application
Open your browser and go to: `http://localhost:3001`

## Demo Scenarios

### Scenario 1: Authentication Flow
Since the backend may not have authentication endpoints yet, you can bypass this for demo purposes:

1. **Bypass Authentication (Temporary)**:
   - Open browser developer tools (F12)
   - Go to Application/Storage -> Local Storage
   - Add a key: `authToken` with value: `demo-token`
   - Refresh the page

2. **Access Protected Routes**:
   - You should now see the navigation with Queue and Deliveries
   - The chat interface should be accessible

### Scenario 2: Chat Interface Demo
1. **Navigate to the Chat (Home page)**
2. **Try sample queries**:
   - "Find restaurants in 90210"
   - "I need warehouses and factories in 28025"
   - "Show me leads for retail stores in New York"
3. **Observe the AI responses and action buttons**

### Scenario 3: Queue Monitoring
1. **Click on "📊 Queue" in navigation**
2. **View queue statistics** (may show empty if no backend queue data)
3. **Try the refresh button**
4. **View job cards** (if any jobs are present)

### Scenario 4: Deliveries Page
1. **Click on "📦 Deliveries" in navigation**
2. **View completed jobs** (may be empty initially)
3. **Try search and filter functionality**
4. **Test download buttons** (mock files for now)

## Testing with Real Backend Data

If your backend is working with real jobs:

### 1. Create a Test Job via API
```bash
# Use PowerShell or a tool like Postman
curl -X POST http://localhost:3000/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{
    "businessTypes": ["Restaurant"], 
    "zipCodes": ["90210"], 
    "clientName": "Demo_Test"
  }'
```

### 2. Monitor the Job
- Go to the Queue page in the frontend
- Watch for the job to appear and change status
- Refresh to see updates

### 3. Check Deliveries
- Once jobs complete, they should appear in the Deliveries page
- Test the download functionality

## Troubleshooting

### Common Issues:
1. **Port conflicts**: React will try port 3001, 3002, etc. if 3000 is taken
2. **CORS errors**: Make sure your backend allows requests from the frontend port
3. **API calls failing**: Check that backend endpoints match the frontend API calls
4. **Authentication bypass**: Remember to add the demo token for testing

### Network Requests:
- Open browser dev tools -> Network tab
- Monitor API calls being made
- Check for 404s or 500 errors

### Console Logs:
- Check browser console for React errors
- Look for component mounting issues
- Verify prop passing and state updates

## Expected User Experience

### 🎯 Smooth Navigation
- Clean, modern interface
- Responsive design works on mobile/tablet
- Fast page transitions

### 💬 Interactive Chat
- Real-time typing indicators
- Action buttons that trigger backend jobs
- Lead previews displayed inline

### 📊 Live Queue Updates
- Auto-refreshing every 10 seconds
- Color-coded job statuses
- Clickable job cards for details

### 📁 File Management
- Clean file listings with icons
- One-click downloads
- Search and filtering capabilities

## Next Steps for Production

1. **Implement Real Authentication**:
   - Connect to backend auth endpoints
   - Add proper JWT handling
   - Implement user registration

2. **Add Error Handling**:
   - Better error messages
   - Retry mechanisms
   - Offline detection

3. **Performance Optimization**:
   - Code splitting
   - Lazy loading
   - Caching strategies

4. **Additional Features**:
   - Real-time WebSocket updates
   - Push notifications
   - Advanced filtering options

## Deployment Notes

For production deployment:
- Build with `npm run build`
- Serve static files from a web server
- Configure environment variables
- Set up proper CORS policies 