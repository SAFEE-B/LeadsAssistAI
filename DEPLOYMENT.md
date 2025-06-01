# 🚀 LeadAssistAI Frontend Deployment Guide

## 📋 Prerequisites

1. **Environment Files Created**: ✅ Done
   - `.env.local` - Local development
   - `.env.production` - Production deployment
   - `.env.example` - Template file

2. **GitHub Repository**: Required for Render deployment

## 🌐 Deploying to Render

### Step 1: Prepare for Deployment

1. **Update Production API URL**:
   Edit `.env.production` and replace `your-backend-app-name` with your actual backend app name:
   ```env
   REACT_APP_API_URL=https://leadassistai-backend.onrender.com
   ```

2. **Test Build Locally**:
   ```bash
   npm run build
   ```

### Step 2: Deploy to Render

1. **Go to [Render.com](https://render.com)**
2. **Connect your GitHub account**
3. **Create New Static Site**
4. **Configure deployment**:
   - **Repository**: Select your LeadAssistAI repository
   - **Branch**: `main` or `master`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `build`

### Step 3: Environment Variables on Render

Add these environment variables in Render dashboard:

```env
REACT_APP_API_URL=https://your-backend-app-name.onrender.com
REACT_APP_ENVIRONMENT=production
REACT_APP_APP_NAME=LeadAssistAI
```

### Step 4: Build Settings

**Advanced Settings**:
- **Node Version**: 18.x or higher
- **Build Command**: `npm install && npm run build`
- **Auto-Deploy**: Yes (deploys on every push to main branch)

## 🔧 Environment Configuration

### Local Development
Uses `.env.local`:
```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_ENVIRONMENT=development
REACT_APP_APP_NAME=LeadAssistAI
```

### Production (Render)
Uses environment variables set in Render dashboard:
```env
REACT_APP_API_URL=https://your-backend-app-name.onrender.com
REACT_APP_ENVIRONMENT=production
REACT_APP_APP_NAME=LeadAssistAI
```

## 🎯 Deployment Checklist

- [ ] Backend deployed and running on Render
- [ ] Frontend environment variables configured
- [ ] Build completes successfully
- [ ] API endpoints accessible from frontend
- [ ] Authentication flow working
- [ ] File downloads working
- [ ] Queue monitoring functional

## 🔍 Testing Your Deployment

1. **Check API Connection**:
   - Open browser console
   - Verify API calls are going to the correct Render backend URL

2. **Test Core Functionality**:
   - Login/Authentication
   - Lead generation requests
   - File downloads
   - Queue monitoring

## 🚨 Troubleshooting

### Common Issues:

1. **API Connection Failed**:
   - Check backend URL in environment variables
   - Verify backend is running on Render
   - Check CORS settings on backend

2. **Build Fails**:
   - Check Node.js version (should be 16+)
   - Verify all dependencies are listed in package.json
   - Check for TypeScript errors

3. **Environment Variables Not Loading**:
   - Ensure variables start with `REACT_APP_`
   - Verify variables are set in Render dashboard
   - Restart the deployment

## 📱 Domain Setup (Optional)

1. **Custom Domain**:
   - Go to Render dashboard → Settings → Custom Domains
   - Add your domain
   - Update DNS records as instructed

## 🔄 Continuous Deployment

Once set up, your app will automatically deploy when you:
1. Push code to your main branch
2. Environment variables are updated
3. Manual trigger from Render dashboard

## 📞 Support

For deployment issues:
1. Check Render deployment logs
2. Verify all environment variables
3. Test API endpoints manually
4. Check browser console for errors 