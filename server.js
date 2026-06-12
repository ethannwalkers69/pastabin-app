const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Proxy route for paste creation
app.post('/api/create-paste', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text content is required'
      });
    }

    // Forward request to external API
    const apiUrl = `https://xeddapi.ezgateway.net/api/tools/pastebin?text=${encodeURIComponent(text)}`;
    
    console.log('📤 Fetching from API:', apiUrl.substring(0, 100) + '...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    // Get the response as text first to handle different formats
    const responseText = await response.text();
    console.log('📥 Raw API Response:', responseText.substring(0, 500));
    
    let data;
    let pasteUrl = null;

    // Try to parse as JSON
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, use the text as data
      data = responseText;
    }

    // Extract URL from various possible response formats
    pasteUrl = extractUrlFromResponse(data);

    // If URL is still not found, try to find any URL in the response text
    if (!pasteUrl) {
      const urlMatch = responseText.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch) {
        pasteUrl = urlMatch[0];
      }
    }

    console.log('✅ Extracted URL:', pasteUrl || 'Not found');

    res.json({
      success: true,
      url: pasteUrl,
      data: data, // Send parsed data
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error creating paste:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create paste. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Extract URL from various possible API response formats
 */
function extractUrlFromResponse(data) {
  // If data is a string, check if it's a URL
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) {
      return data;
    }
    // Try to parse as JSON string
    try {
      data = JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  // Check common URL field names
  const urlFields = [
    'url', 'pasteUrl', 'link', 'paste_url', 'pasteLink',
    'shortUrl', 'short_url', 'redirectUrl', 'redirect_url',
    'resultUrl', 'result_url', 'shareUrl', 'share_url'
  ];

  for (const field of urlFields) {
    if (data[field] && typeof data[field] === 'string') {
      return data[field];
    }
  }

  // Check nested objects
  const nestedObjects = ['data', 'result', 'paste', 'response', 'output', 'body'];
  
  for (const nested of nestedObjects) {
    if (data[nested] && typeof data[nested] === 'object') {
      for (const field of urlFields) {
        if (data[nested][field] && typeof data[nested][field] === 'string') {
          return data[nested][field];
        }
      }
      // Check if nested object itself has a URL-like string value
      const nestedStr = JSON.stringify(data[nested]);
      const urlMatch = nestedStr.match(/https?:\/\/[^\s"']+/);
      if (urlMatch) {
        return urlMatch[0];
      }
    }
  }

  // Check if data.success and data.url pattern
  if (data.success && data.url) {
    return data.url;
  }

  // Check for id-based URL patterns (common in pastebin APIs)
  if (data.id || data.pasteId || data.paste_id) {
    const id = data.id || data.pasteId || data.paste_id;
    // Common pastebin URL patterns
    const possiblePatterns = [
      `https://pastebin.com/${id}`,
      `https://xeddapi.ezgateway.net/paste/${id}`,
      `https://xeddapi.ezgateway.net/${id}`,
      `https://ezgateway.net/paste/${id}`
    ];
    
    for (const pattern of possiblePatterns) {
      if (pattern.includes(id)) {
        return pattern;
      }
    }
  }

  return null;
}

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log('🚀 PasteBin server running on port', PORT);
  console.log('📝 Environment:', process.env.NODE_ENV || 'development');
  console.log('🔗 Local URL: http://localhost:' + PORT);
});