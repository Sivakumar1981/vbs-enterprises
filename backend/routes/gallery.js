const express      = require('express');
const router       = express.Router();
const cloudinary   = require('cloudinary').v2;
const multer       = require('multer');
const GalleryEvent = require('../models/GalleryEvent');
const auth         = require('../middleware/auth');

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer - memory storage then upload to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Upload to Cloudinary helper
async function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'vbs-enterprises/gallery', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

// GET all gallery events (public — customer slideshow uses this)
// Sorted oldest→newest by event date by default so the slideshow reads like a timeline;
// pass ?sort=latest to get most-recent-first (used by admin table).
router.get('/', async (req, res) => {
  try {
    const { sort } = req.query;
    const filter = { isActive: { $ne: false } };
    const order = sort === 'latest' ? { eventDate: -1 } : { order: 1, eventDate: 1 };
    const events = await GalleryEvent.find(filter).sort(order);
    res.json({ success: true, events });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single gallery event
router.get('/:id', async (req, res) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, event });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST create gallery event (admin only)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, caption, eventDate, location, order } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Photo is required' });
    const imageUrl = await uploadToCloudinary(req.file.buffer);
    const event = new GalleryEvent({
      title,
      caption:   caption || '',
      eventDate: eventDate ? new Date(eventDate) : Date.now(),
      location:  location || '',
      order:     parseInt(order) || 0,
      image:     imageUrl
    });
    await event.save();
    res.status(201).json({ success: true, message: 'Gallery photo added', event });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT update gallery event (admin only)
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    const { title, caption, eventDate, location, order, isActive } = req.body;
    if (title)                   event.title     = title;
    if (caption !== undefined)   event.caption   = caption;
    if (eventDate)                event.eventDate = new Date(eventDate);
    if (location !== undefined)  event.location  = location;
    if (order !== undefined)     event.order     = parseInt(order) || 0;
    if (isActive !== undefined)  event.isActive  = isActive === 'true' || isActive === true;
    if (req.file)                event.image     = await uploadToCloudinary(req.file.buffer);
    await event.save();
    res.json({ success: true, message: 'Gallery photo updated', event });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE gallery event (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    await event.deleteOne();
    res.json({ success: true, message: 'Gallery photo deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

