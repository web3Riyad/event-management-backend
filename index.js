import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import { signJwt, verifyJwt, requireJwtAuth } from './jwt.js';

const uri = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@ac-dyizrz2-shard-00-00.khhcdmh.mongodb.net:27017,ac-dyizrz2-shard-00-01.khhcdmh.mongodb.net:27017,ac-dyizrz2-shard-00-02.khhcdmh.mongodb.net:27017/?ssl=true&replicaSet=atlas-ej3urr-shard-0&authSource=admin`;
const client = new MongoClient(uri);
const port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

// Database and Collection reference
const db = client.db('EventManagement');
const eventsCollection = db.collection('event');
const joinedEventsCollection = db.collection('joinedEvents');

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB Atlas (EventManagement database)!");
    return client;
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

connectToMongoDB();

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Event Management API is running...');
});

// Issue JWT Token endpoint (Challenge Requirement: JWT Protection)
app.post(['/jwt', '/api/jwt', '/auth/jwt'], (req, res) => {
  try {
    const { email, name, id } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'User email is required to generate a JWT token.' });
    }

    const token = signJwt({
      id: id || null,
      email: email.trim().toLowerCase(),
      name: name || 'User',
      role: 'user',
    });

    res.json({ token, message: 'JWT token generated successfully' });
  } catch (err) {
    console.error('Error generating JWT:', err);
    res.status(500).json({ error: 'Failed to generate JWT token' });
  }
});

// GET all events with optional filters (timeframe=upcoming|past, eventType=Cleanup|Donation|..., limit=6)
app.get('/events', async (req, res) => {
  try {
    const { timeframe, eventType, limit } = req.query;
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    let query = {};

    // Filter by Event Type / Category if specified and not 'All'
    if (eventType && eventType.toLowerCase() !== 'all') {
      query.eventType = { $regex: new RegExp(`^${eventType}$`, 'i') };
    }

    // Filter by upcoming (>= today) or past (< today)
    let sortOrder = 1; // default ascending
    if (timeframe === 'upcoming') {
      query.eventDate = { $gte: today };
      sortOrder = 1; // Nearest coming date first
    } else if (timeframe === 'past') {
      query.eventDate = { $lt: today };
      sortOrder = -1; // Most recent past event first
    }

    let cursor = eventsCollection.find(query).sort({ eventDate: sortOrder });
    const limitNum = parseInt(limit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      cursor = cursor.limit(limitNum);
    }

    const events = await cursor.toArray();
    res.json(events);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: 'Failed to fetch events', details: err.message });
  }
});

// GET upcoming events: Sorted ascending by eventDate (coming date first), previous days never shown
app.get('/events/upcoming', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { eventType, limit } = req.query;
    let query = { eventDate: { $gte: today } };

    if (eventType && eventType.toLowerCase() !== 'all') {
      query.eventType = { $regex: new RegExp(`^${eventType}$`, 'i') };
    }

    let cursor = eventsCollection.find(query).sort({ eventDate: 1 });
    const limitNum = parseInt(limit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      cursor = cursor.limit(limitNum);
    }

    const events = await cursor.toArray();
    res.json(events);
  } catch (err) {
    console.error("Error fetching upcoming events:", err);
    res.status(500).json({ error: 'Failed to fetch upcoming events', details: err.message });
  }
});

// GET past events: Sorted descending by eventDate (most recent past events first)
app.get('/events/past', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { eventType } = req.query;
    let query = { eventDate: { $lt: today } };

    if (eventType && eventType.toLowerCase() !== 'all') {
      query.eventType = { $regex: new RegExp(`^${eventType}$`, 'i') };
    }

    const events = await eventsCollection.find(query).sort({ eventDate: -1 }).toArray();
    res.json(events);
  } catch (err) {
    console.error("Error fetching past events:", err);
    res.status(500).json({ error: 'Failed to fetch past events', details: err.message });
  }
});

// GET single event by ID
app.get('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query = {};
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    } else {
      query = { _id: id };
    }
    const event = await eventsCollection.findOne(query);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get count of joined volunteers
    const joinedCount = await joinedEventsCollection.countDocuments({
      $or: [{ eventId: id }, { eventId: String(event._id) }]
    });

    res.json({ ...event, joinedCount: joinedCount || event.joinedCount || 0 });
  } catch (err) {
    console.error("Error fetching event by ID:", err);
    res.status(500).json({ error: 'Failed to fetch event', details: err.message });
  }
});

// POST join an event (User must be authenticated with JWT)
app.post('/events/:id/join', requireJwtAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName } = req.body;
    const userEmail = req.user?.email || req.body?.userEmail;

    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required. User email missing.' });
    }

    let query = {};
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    } else {
      query = { _id: id };
    }

    const event = await eventsCollection.findOne(query);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user has already joined this event
    const existingJoin = await joinedEventsCollection.findOne({
      $or: [{ eventId: id }, { eventId: String(event._id) }],
      userEmail: userEmail,
    });

    if (existingJoin) {
      return res.status(409).json({
        message: 'You have already joined this event.',
        alreadyJoined: true,
        data: existingJoin,
      });
    }

    // Store joined event in database with event and user data
    const joinRecord = {
      eventId: String(event._id),
      eventTitle: event.eventTitle,
      eventType: event.eventType,
      eventDate: event.eventDate,
      location: event.location,
      thumbnailImageUrl: event.thumbnailImageUrl,
      eventDescription: event.eventDescription,
      userId: userId || null,
      userName: userName || 'Volunteer',
      userEmail: userEmail,
      joinedAt: new Date(),
    };

    const result = await joinedEventsCollection.insertOne(joinRecord);

    // Update joinedCount on event
    await eventsCollection.updateOne(query, { $inc: { joinedCount: 1 } });

    res.status(201).json({
      message: 'Successfully joined event!',
      joinedId: result.insertedId,
      data: joinRecord,
    });
  } catch (err) {
    console.error("Error joining event:", err);
    res.status(500).json({ error: 'Failed to join event', details: err.message });
  }
});

// GET check if user joined an event
app.get('/events/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!userEmail) {
      return res.json({ hasJoined: false });
    }

    const record = await joinedEventsCollection.findOne({
      $or: [{ eventId: id }, { eventId: String(id) }],
      userEmail: userEmail,
    });

    res.json({ hasJoined: Boolean(record), data: record });
  } catch (err) {
    console.error("Error checking join status:", err);
    res.status(500).json({ error: 'Failed to check join status' });
  }
});

// GET all joined events for a user (sorted by eventDate - Protected by JWT)
app.get(['/user/joined-events', '/events/joined'], requireJwtAuth, async (req, res) => {
  try {
    const userEmail = req.user?.email || req.query.userEmail;
    if (!userEmail) {
      return res.status(400).json({ error: 'userEmail query parameter is required' });
    }
    const joined = await joinedEventsCollection
      .find({ userEmail })
      .sort({ eventDate: 1, joinedAt: -1 })
      .toArray();
    res.json(joined);
  } catch (err) {
    console.error("Error fetching joined events for user:", err);
    res.status(500).json({ error: 'Failed to fetch user joined events' });
  }
});

// POST create a new event (Protected by JWT)
app.post('/events', requireJwtAuth, async (req, res) => {
  try {
    const {
      eventTitle,
      eventType,
      eventDate,
      location,
      thumbnailImageUrl,
      eventDescription,
      creatorName,
      creatorId,
    } = req.body;
    const creatorEmail = req.user?.email || req.body?.creatorEmail;

    if (!eventTitle || !eventType || !eventDate) {
      return res.status(400).json({ error: 'eventTitle, eventType, and eventDate are required' });
    }

    const newEvent = {
      eventTitle: eventTitle.trim(),
      eventType: eventType.trim(),
      eventDate: eventDate.trim(),
      location: location ? location.trim() : '',
      thumbnailImageUrl: thumbnailImageUrl ? thumbnailImageUrl.trim() : 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=1200',
      eventDescription: eventDescription ? eventDescription.trim() : '',
      creatorEmail: creatorEmail || null,
      creatorName: creatorName || null,
      creatorId: creatorId || null,
      joinedCount: 0,
      createdAt: new Date(),
    };

    const result = await eventsCollection.insertOne(newEvent);
    res.status(201).json({
      message: 'Event created successfully',
      insertedId: result.insertedId,
      event: newEvent,
    });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: 'Failed to create event', details: err.message });
  }
});

// GET all created events for a creator (Protected by JWT)
app.get(['/events/creator', '/user/created-events'], requireJwtAuth, async (req, res) => {
  try {
    const creatorEmail = req.user?.email || req.query.creatorEmail;
    if (!creatorEmail) {
      return res.status(400).json({ error: 'creatorEmail query parameter is required' });
    }
    const events = await eventsCollection
      .find({ creatorEmail })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(events);
  } catch (err) {
    console.error("Error fetching created events:", err);
    res.status(500).json({ error: 'Failed to fetch created events' });
  }
});

// PUT update an event (Only creator can update - Protected by JWT)
app.put('/events/:id', requireJwtAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      eventTitle,
      eventType,
      eventDate,
      location,
      thumbnailImageUrl,
      eventDescription,
    } = req.body;
    const userEmail = req.user?.email || req.body?.userEmail;

    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required. userEmail missing.' });
    }

    let query = ObjectId.isValid(id) ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] } : { _id: id };
    const event = await eventsCollection.findOne(query);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Authorization: only the creator can update
    if (event.creatorEmail && event.creatorEmail.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden: You can only update events created by you.' });
    }

    const updateFields = {};
    if (eventTitle) updateFields.eventTitle = eventTitle.trim();
    if (eventType) updateFields.eventType = eventType.trim();
    if (eventDate) updateFields.eventDate = eventDate.trim();
    if (location !== undefined) updateFields.location = location.trim();
    if (thumbnailImageUrl) updateFields.thumbnailImageUrl = thumbnailImageUrl.trim();
    if (eventDescription !== undefined) updateFields.eventDescription = eventDescription.trim();
    updateFields.updatedAt = new Date();

    await eventsCollection.updateOne(query, { $set: updateFields });

    // Also update denormalized joinedEvents if event info changed
    await joinedEventsCollection.updateMany(
      { $or: [{ eventId: id }, { eventId: String(event._id) }] },
      {
        $set: {
          eventTitle: updateFields.eventTitle || event.eventTitle,
          eventType: updateFields.eventType || event.eventType,
          eventDate: updateFields.eventDate || event.eventDate,
          location: updateFields.location !== undefined ? updateFields.location : event.location,
          thumbnailImageUrl: updateFields.thumbnailImageUrl || event.thumbnailImageUrl,
        },
      }
    );

    res.json({ message: 'Event updated successfully', updatedFields });
  } catch (err) {
    console.error("Error updating event:", err);
    res.status(500).json({ error: 'Failed to update event', details: err.message });
  }
});

// DELETE an event (Only creator can delete - Protected by JWT)
app.delete('/events/:id', requireJwtAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email || req.query?.userEmail;

    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required. userEmail missing.' });
    }

    let query = ObjectId.isValid(id) ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] } : { _id: id };
    const event = await eventsCollection.findOne(query);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Authorization: only the creator can delete
    if (event.creatorEmail && event.creatorEmail.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden: You can only delete events created by you.' });
    }

    await eventsCollection.deleteOne(query);

    // Clean up related joinedEvents records
    await joinedEventsCollection.deleteMany({
      $or: [{ eventId: id }, { eventId: String(event._id) }],
    });

    res.json({ message: 'Event deleted successfully', deletedId: id });
  } catch (err) {
    console.error("Error deleting event:", err);
    res.status(500).json({ error: 'Failed to delete event', details: err.message });
  }
});

// GET user profile and activity stats (Protected by JWT)
app.get('/user/profile', requireJwtAuth, async (req, res) => {
  try {
    const userEmail = req.user?.email || req.query.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    const userCollection = db.collection('user');
    const dbUser = await userCollection.findOne({
      email: { $regex: new RegExp(`^${userEmail}$`, 'i') },
    });

    const [createdCount, joinedCount] = await Promise.all([
      eventsCollection.countDocuments({
        creatorEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') },
      }),
      joinedEventsCollection.countDocuments({
        userEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') },
      }),
    ]);

    res.json({
      name: dbUser?.name || req.user?.name || 'Community Volunteer',
      email: dbUser?.email || userEmail,
      image: dbUser?.image || '',
      createdAt: dbUser?.createdAt || null,
      stats: {
        createdEventsCount: createdCount,
        joinedEventsCount: joinedCount,
      },
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// PUT update user profile (Name and Profile Picture - Protected by JWT)
app.put('/user/profile', requireJwtAuth, async (req, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, image } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }

    const trimmedName = name.trim();
    const finalImage = typeof image === 'string' ? image.trim() : '';
    const userCollection = db.collection('user');

    await userCollection.updateOne(
      { email: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
      { $set: { name: trimmedName, image: finalImage, updatedAt: new Date() } }
    );

    // Sync across events and joined events
    await Promise.all([
      eventsCollection.updateMany(
        { creatorEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
        { $set: { creatorName: trimmedName } }
      ),
      joinedEventsCollection.updateMany(
        { userEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') } },
        { $set: { userName: trimmedName } }
      ),
    ]);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: { name: trimmedName, email: userEmail, image: finalImage },
    });
  } catch (err) {
    console.error('Error updating user profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.listen(port, () => {
  console.log(`Event Management Backend running on http://localhost:${port}`);
});


