const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/auth');

// Create a new post
router.post('/', auth, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    
    const post = new Post({
      title,
      content,
      category,
      author: req.user._id
    });

    await post.save();
    
    const populatedPost = await Post.findById(post._id)
      .populate('author', 'username email')
      .exec();

    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Error creating post', error: error.message });
  }
});

// Get all posts (no auth required)
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', 'username email')
      .populate('comments.author', 'username')
      .populate('comments.replies.author', 'username')
      .sort({ createdAt: -1 })
      .exec();
    
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Get posts by category (no auth required)
router.get('/category/:category', async (req, res) => {
  try {
    const posts = await Post.find({ category: req.params.category })
      .populate('author', 'username email')
      .populate('comments.author', 'username')
      .populate('comments.replies.author', 'username')
      .sort({ createdAt: -1 })
      .exec();
    
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts by category:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Add a comment to a post
router.post('/:postId/comments', auth, async (req, res) => {
  try {
    const postId = req.params.postId;
    console.log('Adding comment to post:', postId);
    console.log('Request body:', req.body);
    console.log('User:', req.user);

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    // Validate post ID format
    if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid post ID format' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      console.log('Post not found:', postId);
      return res.status(404).json({ message: 'Post not found' });
    }

    const newComment = {
      content: content.trim(),
      author: req.user._id,
      replies: []
    };

    post.comments.push(newComment);
    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate('author', 'username email')
      .populate('comments.author', 'username')
      .populate('comments.replies.author', 'username')
      .exec();

    console.log('Comment added successfully');
    res.status(201).json(updatedPost);
  } catch (error) {
    console.error('Error adding comment:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid post ID format' });
    }
    res.status(500).json({ message: 'Error adding comment', error: error.message });
  }
});

// Add a reply to a comment
router.post('/:postId/comments/:commentId/replies', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    comment.replies.push({
      content,
      author: req.user._id
    });

    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate('author', 'username email')
      .populate('comments.author', 'username')
      .populate('comments.replies.author', 'username')
      .exec();

    res.status(201).json(updatedPost);
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ message: 'Error adding reply' });
  }
});

// Delete a comment
router.delete('/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.user._id;

    console.log('Delete comment request:', {
      postId,
      commentId,
      userId: userId.toString()
    });

    // First find the post and verify permissions
    const post = await Post.findById(postId);
    if (!post) {
      console.log('Post not found:', postId);
      return res.status(404).json({ message: 'Post not found' });
    }

    // Find the comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      console.log('Comment not found:', commentId);
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check permissions
    const isAuthorized = 
      comment.author.toString() === userId.toString() || 
      post.author.toString() === userId.toString();

    if (!isAuthorized) {
      console.log('Unauthorized delete attempt:', {
        userId: userId.toString(),
        commentAuthor: comment.author.toString(),
        postAuthor: post.author.toString()
      });
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    // Remove the comment using atomic operation
    const result = await Post.findOneAndUpdate(
      { _id: postId },
      { 
        $pull: { 
          comments: { _id: commentId }
        }
      },
      { 
        new: true,
        runValidators: true
      }
    )
    .populate('author', 'username email')
    .populate('comments.author', 'username')
    .populate('comments.replies.author', 'username');

    if (!result) {
      console.log('Post not found after update attempt');
      return res.status(404).json({ message: 'Post not found after update' });
    }

    console.log('Comment deleted successfully');
    res.json(result);

  } catch (error) {
    console.error('Error in delete comment route:', error);
    res.status(500).json({ 
      message: 'Error deleting comment',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Delete a reply
router.delete('/:postId/comments/:commentId/replies/:replyId', auth, async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const userId = req.user._id;

    console.log('Delete reply request:', {
      postId,
      commentId,
      replyId,
      userId: userId.toString()
    });

    // First find the post and verify permissions
    const post = await Post.findById(postId);
    if (!post) {
      console.log('Post not found:', postId);
      return res.status(404).json({ message: 'Post not found' });
    }

    // Find the comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      console.log('Comment not found:', commentId);
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find the reply
    const reply = comment.replies.id(replyId);
    if (!reply) {
      console.log('Reply not found:', replyId);
      return res.status(404).json({ message: 'Reply not found' });
    }

    // Check permissions
    const isAuthorized = 
      reply.author.toString() === userId.toString() || 
      comment.author.toString() === userId.toString() || 
      post.author.toString() === userId.toString();

    if (!isAuthorized) {
      console.log('Unauthorized delete attempt:', {
        userId: userId.toString(),
        replyAuthor: reply.author.toString(),
        commentAuthor: comment.author.toString(),
        postAuthor: post.author.toString()
      });
      return res.status(403).json({ message: 'Not authorized to delete this reply' });
    }

    // Remove the reply using atomic operation
    const result = await Post.findOneAndUpdate(
      { 
        _id: postId,
        'comments._id': commentId
      },
      { 
        $pull: { 
          'comments.$.replies': { _id: replyId }
        }
      },
      { 
        new: true,
        runValidators: true
      }
    )
    .populate('author', 'username email')
    .populate('comments.author', 'username')
    .populate('comments.replies.author', 'username');

    if (!result) {
      console.log('Post not found after update attempt');
      return res.status(404).json({ message: 'Post not found after update' });
    }

    console.log('Reply deleted successfully');
    res.json(result);

  } catch (error) {
    console.error('Error in delete reply route:', error);
    res.status(500).json({ 
      message: 'Error deleting reply',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router; 