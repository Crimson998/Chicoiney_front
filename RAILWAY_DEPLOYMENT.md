# Railway Deployment Guide

## Prerequisites
- GitHub account
- Railway account (free tier available)

## Step 1: Push to GitHub
1. Create a new repository on GitHub
2. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

## Step 2: Deploy on Railway
1. Go to [railway.app](https://railway.app)
2. Sign up/Login with your GitHub account
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Railway will automatically detect it's a FastAPI app and deploy it

## Step 3: Environment Variables (Optional)
If you want to set custom environment variables:
1. Go to your project on Railway
2. Click on "Variables" tab
3. Add any environment variables you need (like SECRET_KEY, SERVER_SEED)

## Step 4: Get Your URL
1. Once deployed, Railway will give you a URL like: `https://your-app-name.railway.app`
2. Your API will be available at that URL

## Benefits of Railway over PythonAnywhere:
- ✅ Native ASGI support (no WSGI conversion needed)
- ✅ Automatic HTTPS
- ✅ Simple deployment from GitHub
- ✅ Better error handling
- ✅ No virtual environment issues
- ✅ Automatic dependency installation
- ✅ Free tier available

## Testing Your Deployment
Once deployed, test these endpoints:
- `GET /` - Should return a welcome message
- `POST /auth/register` - User registration
- `POST /auth/login` - User login

Your frontend can now connect to the Railway URL instead of PythonAnywhere! 