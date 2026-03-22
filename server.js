/**
 * Baby Care AI - Backend Server
 * Intelligent Baby Care and Monitoring System
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'babycare-ai-secret-key-2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// In-memory database (replace with MongoDB/PostgreSQL in production)
const db = {
    users: [],
    babies: [],
    activities: [],
    iotData: [],
    growthRecords: [],
    reminders: [],
    communityPosts: [],
    cryRecords: []
};

// Initialize with sample data
initializeSampleData();

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: uuidv4(),
            email,
            password: hashedPassword,
            name,
            createdAt: new Date().toISOString()
        };
        
        db.users.push(user);
        
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            token, 
            user: { id: user.id, email: user.email, name: user.name } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = db.users.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            token, 
            user: { id: user.id, email: user.email, name: user.name } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
    const user = db.users.find(u => u.id === req.user.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ id: user.id, email: user.email, name: user.name });
});

// ==================== BABY ROUTES ====================

// Get babies for user
app.get('/api/babies', authenticateToken, (req, res) => {
    const babies = db.babies.filter(b => b.parentId === req.user.userId);
    res.json(babies);
});

// Create baby profile
app.post('/api/babies', authenticateToken, (req, res) => {
    const { name, birthDate, gender, photoUrl } = req.body;
    
    const baby = {
        id: uuidv4(),
        parentId: req.user.userId,
        name,
        birthDate,
        gender,
        photoUrl: photoUrl || '',
        createdAt: new Date().toISOString()
    };
    
    db.babies.push(baby);
    res.json(baby);
});

// Update baby
app.put('/api/babies/:id', authenticateToken, (req, res) => {
    const babyIndex = db.babies.findIndex(b => b.id === req.params.id && b.parentId === req.user.userId);
    if (babyIndex === -1) {
        return res.status(404).json({ error: 'Baby not found' });
    }
    
    db.babies[babyIndex] = { ...db.babies[babyIndex], ...req.body };
    res.json(db.babies[babyIndex]);
});

// ==================== ACTIVITY ROUTES ====================

// Get activities
app.get('/api/activities', authenticateToken, (req, res) => {
    const { babyId, type, startDate, endDate, limit = 50 } = req.query;
    
    let activities = db.activities.filter(a => a.parentId === req.user.userId);
    
    if (babyId) activities = activities.filter(a => a.babyId === babyId);
    if (type) activities = activities.filter(a => a.type === type);
    if (startDate) activities = activities.filter(a => new Date(a.timestamp) >= new Date(startDate));
    if (endDate) activities = activities.filter(a => new Date(a.timestamp) <= new Date(endDate));
    
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(activities.slice(0, parseInt(limit)));
});

// Log activity
app.post('/api/activities', authenticateToken, (req, res) => {
    const { babyId, type, details, timestamp } = req.body;
    
    const activity = {
        id: uuidv4(),
        parentId: req.user.userId,
        babyId,
        type,
        details,
        timestamp: timestamp || new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    
    db.activities.push(activity);
    
    // Run AI analysis after activity
    const analysis = analyzeActivity(activity);
    
    res.json({ ...activity, analysis });
});

// Get today's stats
app.get('/api/stats/today', authenticateToken, (req, res) => {
    const { babyId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let activities = db.activities.filter(a => 
        a.parentId === req.user.userId && 
        new Date(a.timestamp) >= today
    );
    
    if (babyId) activities = activities.filter(a => a.babyId === babyId);
    
    const stats = {
        feedings: activities.filter(a => a.type === 'feeding').length,
        sleepDuration: calculateTotalSleep(activities),
        diaperChanges: activities.filter(a => a.type === 'diaper').length,
        cryEvents: activities.filter(a => a.type === 'cry').length
    };
    
    res.json(stats);
});

// ==================== CRY DETECTION ROUTES ====================

// Analyze cry
app.post('/api/cry/analyze', authenticateToken, (req, res) => {
    const { babyId, audioData, duration } = req.body;
    
    // AI-powered cry classification (simulated ML)
    const cryTypes = [
        { type: 'hungry', label: '🍼 Hungry', confidence: 85 + Math.random() * 10 },
        { type: 'sleepy', label: '😴 Sleepy', confidence: 80 + Math.random() * 15 },
        { type: 'discomfort', label: '😣 Discomfort', confidence: 75 + Math.random() * 15 },
        { type: 'pain', label: '😫 Pain', confidence: 70 + Math.random() * 20 },
        { type: 'tired', label: '😫 Tired', confidence: 82 + Math.random() * 10 }
    ];
    
    // Analyze based on recent patterns
    const recentActivities = db.activities
        .filter(a => a.babyId === babyId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
    
    const lastFeeding = recentActivities.find(a => a.type === 'feeding');
    const lastSleep = recentActivities.find(a => a.type === 'sleep');
    const hoursSinceFeeding = lastFeeding ? 
        (new Date() - new Date(lastFeeding.timestamp)) / (1000 * 60 * 60) : 999;
    const hoursSinceSleep = lastSleep ? 
        (new Date() - new Date(lastSleep.timestamp)) / (1000 * 60 * 60) : 999;
    
    // Adjust probabilities based on context
    let probabilities = cryTypes.map(c => {
        let adjusted = c.confidence;
        if (c.type === 'hungry' && hoursSinceFeeding > 2) adjusted += 10;
        if (c.type === 'sleepy' && hoursSinceSleep > 3) adjusted += 10;
        return { ...c, confidence: adjusted };
    });
    
    probabilities.sort((a, b) => b.confidence - a.confidence);
    const result = probabilities[0];
    
    // Generate suggestions
    const suggestions = generateCrySuggestions(result.type);
    
    const cryRecord = {
        id: uuidv4(),
        parentId: req.user.userId,
        babyId,
        type: result.type,
        label: result.label,
        confidence: result.confidence,
        suggestions,
        duration: duration || 0,
        timestamp: new Date().toISOString()
    };
    
    db.cryRecords.push(cryRecord);
    
    res.json(cryRecord);
});

// Get cry history
app.get('/api/cry/history', authenticateToken, (req, res) => {
    const { babyId, limit = 20 } = req.query;
    
    let records = db.cryRecords.filter(c => c.parentId === req.user.userId);
    if (babyId) records = records.filter(c => c.babyId === babyId);
    
    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(records.slice(0, parseInt(limit)));
});

// Get cry statistics
app.get('/api/cry/stats', authenticateToken, (req, res) => {
    const { babyId, days = 7 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    let records = db.cryRecords.filter(c => 
        c.parentId === req.user.userId && 
        new Date(c.timestamp) >= startDate
    );
    
    if (babyId) records = records.filter(c => c.babyId === babyId);
    
    const distribution = {};
    records.forEach(r => {
        distribution[r.type] = (distribution[r.type] || 0) + 1;
    });
    
    const total = records.length || 1;
    const percentages = Object.keys(distribution).map(key => ({
        type: key,
        count: distribution[key],
        percentage: Math.round((distribution[key] / total) * 100)
    }));
    
    res.json({
        total: records.length,
        distribution: percentages,
        averageConfidence: records.length > 0 ? 
            Math.round(records.reduce((sum, r) => sum + r.confidence, 0) / records.length) : 0
    });
});

// ==================== IOT MONITORING ROUTES ====================

// Get current IoT data
app.get('/api/iot/current', authenticateToken, (req, res) => {
    const { babyId } = req.query;
    
    let data = db.iotData.filter(i => i.parentId === req.user.userId);
    if (babyId) data = data.filter(i => i.babyId === babyId);
    
    data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (data.length === 0) {
        return res.json(getDefaultIoTData());
    }
    
    res.json(data[0]);
});

// Get IoT history
app.get('/api/iot/history', authenticateToken, (req, res) => {
    const { babyId, hours = 24 } = req.query;
    
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - parseInt(hours));
    
    let data = db.iotData.filter(i => 
        i.parentId === req.user.userId && 
        new Date(i.timestamp) >= startDate
    );
    
    if (babyId) data = data.filter(i => i.babyId === babyId);
    
    data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json(data);
});

// Simulate IoT data (for testing)
app.post('/api/iot/simulate', authenticateToken, (req, res) => {
    const { babyId } = req.body;
    
    const iotData = {
        id: uuidv4(),
        parentId: req.user.userId,
        babyId,
        temperature: 70 + Math.random() * 10,
        humidity: 40 + Math.random() * 20,
        noiseLevel: 20 + Math.random() * 30,
        lightLevel: Math.random() * 100,
        airQuality: ['Good', 'Moderate', 'Excellent'][Math.floor(Math.random() * 3)],
        movement: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        timestamp: new Date().toISOString()
    };
    
    db.iotData.push(iotData);
    
    // Check for alerts
    const alerts = checkIoTAlerts(iotData);
    
    res.json({ ...iotData, alerts });
});

// ==================== GROWTH TRACKING ROUTES ====================

// Get growth records
app.get('/api/growth', authenticateToken, (req, res) => {
    const { babyId } = req.query;
    
    let records = db.growthRecords.filter(g => g.parentId === req.user.userId);
    if (babyId) records = records.filter(g => g.babyId === babyId);
    
    records.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(records);
});

// Add growth record
app.post('/api/growth', authenticateToken, (req, res) => {
    const { babyId, weight, length, headCircumference, date } = req.body;
    
    const record = {
        id: uuidv4(),
        parentId: req.user.userId,
        babyId,
        weight: parseFloat(weight),
        length: parseFloat(length),
        headCircumference: parseFloat(headCircumference),
        date: date || new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    
    db.growthRecords.push(record);
    res.json(record);
});

// Get growth percentiles
app.get('/api/growth/percentiles', authenticateToken, (req, res) => {
    const { babyId } = req.query;
    
    const records = db.growthRecords
        .filter(g => g.parentId === req.user.userId && g.babyId === babyId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (records.length === 0) {
        return res.json({ percentile: 50, status: 'Normal' });
    }
    
    const latest = records[0];
    // Simplified percentile calculation
    const percentile = Math.min(95, Math.max(5, 50 + (latest.weight - 14) * 10));
    
    res.json({
        weight: latest.weight,
        length: latest.length,
        headCircumference: latest.headCircumference,
        percentile: Math.round(percentile),
        status: percentile >= 5 && percentile <= 95 ? 'Healthy' : 'Needs Attention'
    });
});

// ==================== AI PREDICTION ROUTES ====================

// Get AI predictions
app.get('/api/predictions', authenticateToken, (req, res) => {
    const { babyId, days = 7 } = req.query;
    
    const activities = db.activities
        .filter(a => a.parentId === req.user.userId && a.babyId === babyId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const predictions = {
        sleep: predictSleepPattern(activities, parseInt(days)),
        feeding: predictFeedingPattern(activities, parseInt(days)),
        health: predictHealthRisks(activities),
        milestones: predictMilestones(babyId)
    };
    
    res.json(predictions);
});

// Get AI suggestions
app.get('/api/ai/suggestions', authenticateToken, (req, res) => {
    const { babyId } = req.query;
    
    const activities = db.activities
        .filter(a => a.parentId === req.user.userId && a.babyId === babyId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 20);
    
    const suggestions = generateAISuggestions(activities);
    res.json(suggestions);
});

// ==================== REMINDER ROUTES ====================

// Get reminders
app.get('/api/reminders', authenticateToken, (req, res) => {
    const { babyId } = req.query;
    
    let reminders = db.reminders.filter(r => r.parentId === req.user.userId);
    if (babyId) reminders = reminders.filter(r => r.babyId === babyId);
    
    reminders.sort((a, b) => new Date(a.time) - new Date(b.time));
    res.json(reminders);
});

// Create reminder
app.post('/api/reminders', authenticateToken, (req, res) => {
    const { babyId, title, time, repeat, type } = req.body;
    
    const reminder = {
        id: uuidv4(),
        parentId: req.user.userId,
        babyId,
        title,
        time,
        repeat: repeat || 'daily',
        type: type || 'general',
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    db.reminders.push(reminder);
    res.json(reminder);
});

// Update reminder
app.put('/api/reminders/:id', authenticateToken, (req, res) => {
    const index = db.reminders.findIndex(r => 
        r.id === req.params.id && r.parentId === req.user.userId
    );
    
    if (index === -1) {
        return res.status(404).json({ error: 'Reminder not found' });
    }
    
    db.reminders[index] = { ...db.reminders[index], ...req.body };
    res.json(db.reminders[index]);
});

// Delete reminder
app.delete('/api/reminders/:id', authenticateToken, (req, res) => {
    const index = db.reminders.findIndex(r => 
        r.id === req.params.id && r.parentId === req.user.userId
    );
    
    if (index === -1) {
        return res.status(404).json({ error: 'Reminder not found' });
    }
    
    db.reminders.splice(index, 1);
    res.json({ success: true });
});

// ==================== COMMUNITY ROUTES ====================

// Get community posts
app.get('/api/community/posts', (req, res) => {
    const { limit = 20, offset = 0 } = req.query;
    
    const posts = db.communityPosts
        .filter(p => p.status === 'published')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(posts.slice(parseInt(offset), parseInt(offset) + parseInt(limit)));
});

// Create post
app.post('/api/community/posts', authenticateToken, (req, res) => {
    const { content, babyAge } = req.body;
    
    const user = db.users.find(u => u.id === req.user.userId);
    
    const post = {
        id: uuidv4(),
        parentId: req.user.userId,
        author: user?.name || 'Anonymous',
        babyAge: babyAge || 'Unknown',
        content,
        likes: 0,
        comments: [],
        status: 'published',
        createdAt: new Date().toISOString()
    };
    
    db.communityPosts.push(post);
    res.json(post);
});

// Like post
app.post('/api/community/posts/:id/like', (req, res) => {
    const post = db.communityPosts.find(p => p.id === req.params.id);
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }
    
    post.likes += 1;
    res.json({ likes: post.likes });
});

// Get expert advice
app.get('/api/community/experts', (req, res) => {
    const experts = [
        {
            id: 1,
            name: 'Dr. Jennifer Smith',
            title: 'Pediatrician',
            avatar: '👩‍⚕️',
            specialties: ['Sleep Training', 'Nutrition', 'Development'],
            tips: [
                { question: 'When should I start sleep training?', answer: 'Most babies are ready between 4-6 months. Look for consistent sleepy cues.' },
                { question: 'Is my baby eating enough?', answer: 'Follow hunger cues. 6-8 wet diapers a day is a good indicator.' }
            ]
        },
        {
            id: 2,
            name: 'Lisa Chen',
            title: 'Child Nutritionist',
            avatar: '👩‍🔬',
            specialties: ['Solid Foods', 'Allergies', 'Feeding Tips'],
            tips: [
                { question: 'When to start solids?', answer: 'Around 6 months when baby can sit up and show interest in food.' },
                { question: 'Common first foods?', answer: 'Single-grain cereals, pureed sweet potatoes, bananas, or avocados.' }
            ]
        },
        {
            id: 3,
            name: 'Dr. Michael Brown',
            title: 'Child Psychologist',
            avatar: '👨‍⚕️',
            specialties: ['Behavior', 'Crying Patterns', 'Bonding'],
            tips: [
                { question: 'Why does my baby cry?', answer: 'Crying is communication. Common reasons: hunger, diaper, tiredness, overstimulation.' },
                { question: 'How to soothe a crying baby?', answer: 'Try the 5 S\'s: Swaddle, Side-position, Shush, Swing, Suck.' }
            ]
        }
    ];
    
    res.json(experts);
});

// ==================== HELPER FUNCTIONS ====================

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

function analyzeActivity(activity) {
    const suggestions = [];
    let alertLevel = 'normal';
    
    if (activity.type === 'feeding') {
        const hoursSinceLast = getHoursSinceLastActivity(activity.babyId, 'feeding');
        if (hoursSinceLast > 4) {
            suggestions.push('Consider feeding more frequently');
            alertLevel = 'warning';
        } else {
            suggestions.push('Good feeding pattern maintained');
        }
    }
    
    if (activity.type === 'cry') {
        suggestions.push('Monitor for recurring patterns');
    }
    
    return { suggestions, alertLevel };
}

function getHoursSinceLastActivity(babyId, type) {
    const activities = db.activities
        .filter(a => a.babyId === babyId && a.type === type)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (activities.length === 0) return 999;
    
    return (new Date() - new Date(activities[0].timestamp)) / (1000 * 60 * 60);
}

function calculateTotalSleep(activities) {
    const sleepActivities = activities.filter(a => a.type === 'sleep');
    let totalMinutes = 0;
    
    sleepActivities.forEach(a => {
        if (a.details && a.details.duration) {
            totalMinutes += parseInt(a.details.duration);
        }
    });
    
    return Math.round(totalMinutes / 60 * 10) / 10;
}

function generateCrySuggestions(cryType) {
    const suggestions = {
        hungry: [
            'Prepare feeding - breast milk or formula',
            'Check last feeding time',
            'Look for hunger cues like rooting'
        ],
        sleepy: [
            'Create a calm, dark environment',
            'Use white noise',
            'Try swaddling'
        ],
        discomfort: [
            'Check diaper for wetness or soiling',
            'Look for clothing tags or tightness',
            'Try gentle tummy massage for gas'
        ],
        pain: [
            'Check for fever or temperature',
            'Look for signs of teething',
            'Consult pediatrician if persistent'
        ],
        tired: [
            'Put baby down for a nap',
            'Use rocking motion',
            'Try a pacifier'
        ]
    };
    
    return suggestions[cryType] || suggestions.discomfort;
}

function getDefaultIoTData() {
    return {
        temperature: 72,
        humidity: 45,
        noiseLevel: 30,
        lightLevel: 40,
        airQuality: 'Good',
        movement: 'Low',
        status: 'normal',
        timestamp: new Date().toISOString()
    };
}

function checkIoTAlerts(data) {
    const alerts = [];
    
    if (data.temperature > 76) {
        alerts.push({ type: 'temperature', level: 'warning', message: 'Room is slightly warm' });
    }
    if (data.temperature > 80) {
        alerts.push({ type: 'temperature', level: 'danger', message: 'Room is too hot!' });
    }
    if (data.humidity < 30) {
        alerts.push({ type: 'humidity', level: 'warning', message: 'Air is too dry' });
    }
    if (data.noiseLevel > 60) {
        alerts.push({ type: 'noise', level: 'warning', message: 'Room is too noisy' });
    }
    
    return alerts;
}

function predictSleepPattern(activities, days) {
    const sleepActivities = activities.filter(a => a.type === 'sleep');
    const avgSleepPerDay = sleepActivities.length * 1.5; // Simplified
    
    return {
        predicted: avgSleepPerDay,
        trend: 'stable',
        nextMilestone: 'Sleeping through the night',
        estimatedWeeks: 2,
        confidence: 75
    };
}

function predictFeedingPattern(activities, days) {
    const feedingActivities = activities.filter(a => a.type === 'feeding');
    const avgFeedingsPerDay = feedingActivities.length || 6;
    
    return {
        current: avgFeedingsPerDay,
        predicted: Math.max(4, avgFeedingsPerDay - 1),
        transition: 'Solids introduction recommended',
        confidence: 70
    };
}

function predictHealthRisks(activities) {
    const recentActivities = activities.slice(0, 20);
    const cryEvents = recentActivities.filter(a => a.type === 'cry').length;
    
    if (cryEvents > 10) {
        return {
            risk: 'medium',
            message: 'Increased crying detected - monitor for teething or discomfort',
            actions: ['Check temperature', 'Look for teething signs', 'Review feeding schedule']
        };
    }
    
    return {
        risk: 'low',
        message: 'No concerning patterns detected',
        actions: ['Continue current routine']
    };
}

function predictMilestones(babyId) {
    const baby = db.babies.find(b => b.id === babyId);
    
    if (!baby) {
        return [{ milestone: 'Unknown', estimatedAge: 'N/A' }];
    }
    
    const ageInMonths = (new Date() - new Date(baby.birthDate)) / (1000 * 60 * 60 * 24 * 30);
    
    const milestones = [
        { age: 6, milestone: 'Rolling over', achieved: ageInMonths >= 6 },
        { age: 6, milestone: 'Sitting with support', achieved: ageInMonths >= 6 },
        { age: 9, milestone: 'Crawling', achieved: ageInMonths >= 9 },
        { age: 12, milestone: 'First steps', achieved: ageInMonths >= 12 }
    ];
    
    const upcoming = milestones.filter(m => !m.achieved && m.age - ageInMonths <= 2);
    const achieved = milestones.filter(m => m.achieved);
    
    return {
        achieved,
        upcoming,
        overallStatus: achieved.length >= milestones.length - 1 ? 'On Track' : 'Developing'
    };
}

function generateAISuggestions(activities) {
    const suggestions = [];
    
    // Analyze feeding patterns
    const feedings = activities.filter(a => a.type === 'feeding');
    if (feedings.length > 0) {
        const lastFeeding = feedings[0];
        const hoursSince = (new Date() - new Date(lastFeeding.timestamp)) / (1000 * 60 * 60);
        
        if (hoursSince >= 2.5) {
            suggestions.push({
                type: 'feeding',
                priority: 'high',
                message: `Baby may be hungry - ${Math.round(hoursSince)} hours since last feeding`,
                confidence: 92,
                action: 'Consider feeding now'
            });
        }
    }
    
    // Analyze sleep patterns
    const sleeps = activities.filter(a => a.type === 'sleep');
    if (sleeps.length > 0) {
        const lastSleep = sleeps[0];
        const hoursSince = (new Date() - new Date(lastSleep.timestamp)) / (1000 * 60 * 60);
        
        if (hoursSince >= 3) {
            suggestions.push({
                type: 'sleep',
                priority: 'medium',
                message: 'Baby may be getting sleepy - 3+ hours awake',
                confidence: 85,
                action: 'Watch for sleepy cues'
            });
        }
    }
    
    // General health
    suggestions.push({
        type: 'health',
        priority: 'low',
        message: 'All vitals normal - great job parenting!',
        confidence: 98,
        action: 'Keep up the good work'
    });
    
    return suggestions;
}

function initializeSampleData() {
    // Sample user
    const sampleUser = {
        id: 'user-001',
        email: 'demo@babycare.ai',
        password: bcrypt.hashSync('demo123', 10),
        name: 'Demo Parent',
        createdAt: new Date().toISOString()
    };
    db.users.push(sampleUser);
    
    // Sample baby
    const sampleBaby = {
        id: 'baby-001',
        parentId: 'user-001',
        name: 'Baby Emma',
        birthDate: '2024-09-15',
        gender: 'female',
        photoUrl: '',
        createdAt: new Date().toISOString()
    };
    db.babies.push(sampleBaby);
    
    // Sample activities
    const activityTypes = ['feeding', 'sleep', 'diaper', 'cry'];
    const now = new Date();
    
    for (let i = 0; i < 30; i++) {
        const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
        const timestamp = new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000);
        
        let details = {};
        if (type === 'feeding') {
            details = { amount: 90 + Math.random() * 60, type: ['breast', 'formula'][Math.floor(Math.random() * 2)] };
        } else if (type === 'sleep') {
            details = { duration: 30 + Math.random() * 120 };
        } else if (type === 'diaper') {
            details = { type: ['wet', 'soiled'][Math.floor(Math.random() * 2)] };
        } else if (type === 'cry') {
            details = { type: ['hungry', 'sleepy', 'discomfort'][Math.floor(Math.random() * 3)] };
        }
        
        db.activities.push({
            id: uuidv4(),
            parentId: 'user-001',
            babyId: 'baby-001',
            type,
            details,
            timestamp: timestamp.toISOString(),
            createdAt: timestamp.toISOString()
        });
    }
    
    // Sample growth records
    for (let i = 0; i < 6; i++) {
        db.growthRecords.push({
            id: uuidv4(),
            parentId: 'user-001',
            babyId: 'baby-001',
            weight: 8 + i * 1.2,
            length: 20 + i * 0.8,
            headCircumference: 14 + i * 0.3,
            date: new Date(2024, 9 + i, 1).toISOString(),
            createdAt: new Date().toISOString()
        });
    }
    
    // Sample reminders
    const reminders = [
        { title: 'Morning Feeding', time: '08:00', repeat: 'daily', type: 'feeding' },
        { title: 'Vitamin D', time: '08:00', repeat: 'daily', type: 'medication' },
        { title: 'Bedtime Routine', time: '19:30', repeat: 'daily', type: 'sleep' },
        { title: 'Pediatrician Checkup', time: '2025-03-25T10:00', repeat: 'once', type: 'appointment' }
    ];
    
    reminders.forEach(r => {
        db.reminders.push({
            id: uuidv4(),
            parentId: 'user-001',
            babyId: 'baby-001',
            ...r,
            completed: false,
            createdAt: new Date().toISOString()
        });
    });
    
    // Sample community posts
    const posts = [
        { author: 'Sarah M.', babyAge: '5 months', content: '🎉 Baby slept through the night for the first time! 7 hours straight! So proud of our little one.' },
        { author: 'Mike T.', babyAge: '4 months', content: 'Anyone else dealing with teething? Started at 3 months. Found frozen washcloths help a lot! 🧊' },
        { author: 'Emma L.', babyAge: '6 months', content: 'Just started introducing solids - sweet potatoes were a hit! 🌟 Any recommendations for first foods?' }
    ];
    
    posts.forEach(p => {
        db.communityPosts.push({
            id: uuidv4(),
            parentId: uuidv4(),
            ...p,
            likes: Math.floor(Math.random() * 30),
            comments: [],
            status: 'published',
            createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
        });
    });
    
    // Sample IoT data
    for (let i = 0; i < 24; i++) {
        db.iotData.push({
            id: uuidv4(),
            parentId: 'user-001',
            babyId: 'baby-001',
            temperature: 70 + Math.random() * 8,
            humidity: 40 + Math.random() * 20,
            noiseLevel: 20 + Math.random() * 20,
            lightLevel: Math.random() * 60,
            airQuality: 'Good',
            movement: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
            timestamp: new Date(Date.now() - i * 60 * 60 * 1000).toISOString()
        });
    }
    
    // Sample cry records
    const cryTypes = ['hungry', 'sleepy', 'discomfort', 'pain'];
    for (let i = 0; i < 20; i++) {
        const type = cryTypes[Math.floor(Math.random() * cryTypes.length)];
        db.cryRecords.push({
            id: uuidv4(),
            parentId: 'user-001',
            babyId: 'baby-001',
            type,
            label: getCryLabel(type),
            confidence: 75 + Math.random() * 20,
            suggestions: generateCrySuggestions(type),
            duration: 5 + Math.random() * 15,
            timestamp: new Date(Date.now() - i * 4 * 60 * 60 * 1000).toISOString()
        });
    }
}

function getCryLabel(type) {
    const labels = {
        hungry: '🍼 Hungry',
        sleepy: '😴 Sleepy',
        discomfort: '😣 Discomfort',
        pain: '😫 Pain'
    };
    return labels[type] || '😢 Unknown';
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   👶 Baby Care AI Backend Server                         ║
║   🚀 Running on http://localhost:${PORT}                   ║
║                                                           ║
║   📚 API Endpoints:                                      ║
║   • POST /api/auth/register - Register new user           ║
║   • POST /api/auth/login - Login user                     ║
║   • GET  /api/auth/me - Get current user                 ║
║   • GET  /api/babies - Get baby profiles                 ║
║   • POST /api/babies - Create baby profile               ║
║   • GET  /api/activities - Get activity history          ║
║   • POST /api/activities - Log new activity              ║
║   • GET  /api/stats/today - Get today's stats            ║
║   • POST /api/cry/analyze - Analyze baby cry             ║
║   • GET  /api/cry/history - Get cry history              ║
║   • GET  /api/iot/current - Get current IoT data        ║
║   • GET  /api/growth - Get growth records                ║
║   • POST /api/growth - Add growth record                 ║
║   • GET  /api/predictions - Get AI predictions           ║
║   • GET  /api/ai/suggestions - Get AI suggestions        ║
║   • GET  /api/reminders - Get reminders                  ║
║   • POST /api/reminders - Create reminder               ║
║   • GET  /api/community/posts - Get community posts     ║
║   • POST /api/community/posts - Create post              ║
║   • GET  /api/community/experts - Get expert advice     ║
║                                                           ║
║   🔑 Demo Credentials:                                   ║
║   • Email: demo@babycare.ai                              ║
║   • Password: demo123                                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
