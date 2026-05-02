    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// -----------------------
app.post('/api/logout', authenticateUser, async (req, res) => {
