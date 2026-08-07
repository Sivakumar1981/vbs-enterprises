const mongoose = require('mongoose');

const galleryEventSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  caption:     { type: String, default: '' },       // detail text shown over/under the photo
  eventDate:   { type: Date, default: Date.now },    // date of the stall / activity (drives the timeline order)
  location:    { type: String, default: '' },        // optional e.g. "Vanagaram Weekend Stall"
  image:       { type: String, required: true },
  order:       { type: Number, default: 0 },         // manual sort override (lower = first)
  isActive:    { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GalleryEvent', galleryEventSchema);
