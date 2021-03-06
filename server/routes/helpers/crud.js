/**
 * MIDDLEWARE-RETURNING FUNCTIONS:
 * createDoc(ModelStr, tieToUser = false // tieToUser = property to reference user)
 * getDocsAndSend(ModelStr, refPropName = false)
 * getDocAndSend(ModelStr) // requires req.params.id
 * getDocAndUpdate(ModelStr) // requires req.params.id
 * getDocAndDelete(ModelStr) // requires req.params.id
 *
 * getDocAndSendIfOwnerOrAdmin(ModelStr) // requires req.params.id
 * getDocAndUpdateIfOwnerOrAdmin(ModelStr) // requires req.params.id
 * getDocAndDeleteIfOwnerOrAdmin(ModelStr) // requires req.params.id
*/


const mongoose = require('mongoose');
const Promise = require('bluebird');
const User = mongoose.model('User');
const Level = mongoose.model('Level');

const allowedHost = "http://127.0.0.1:1337";

/**
 * INTERNAL HELPERS
 */
const ownerOrAdmin = (doc, user) => {
  if (!user) return false;
  return doc.user.equals(user._id) || user.isAdmin
}

const sendDocIfOwnerOrAdmin = (doc, user, res) => {
  if (ownerOrAdmin(doc, user)) res.json(doc);
  else res.status(401).end();
};

const getLevelsByType = (userPromise, levelType, page) => {
  var levelPromise;
  var options = {
    sort: {
      dateCreated: 'desc'
    },
    limit: 8,
    skip: page*8
  };

  if(levelType === 'created' || levelType === 'drafts') {
    levelPromise = userPromise
      .then(user => {
        var count;
        var params = {
          path: 'createdLevels',
          select: 'title dateCreated starCount',
          options: options
        };
        if(levelType === 'created') {
          params.match = { published: true };
          count = user.totalCreatedLevels;
        }
        else if(levelType === 'drafts') {
          params.match = { published: false };
          count = user.totalDrafts;
        }
        user = user.populate(params)
        .execPopulate();

        return Promise.all([user, count])
      })
      .then(data => {
        return [data[0].createdLevels,data[1]];
      })
    // levelPromise = Level.find({ creator: id }).limit(8).skip(page*8).sort({ dateCreated: 'desc' });
  } else if(levelType === 'following') {
    levelPromise = userPromise
      .then(user => {
        if(!user) return next();
        if(user.likedLevels.length === 0) return [[],0];
        var following = user.following.map(function(creator) {
          return { creator: creator };
        });
        var levels = Level.find({ $or: following, published: true })
          .limit(8)
          .skip(page*8)
          .select('title creator dateCreated starCount')
          .populate({
            path: 'creator',
            select: 'name'
          })
          .sort({ dateCreated: 'desc' });

        var count = Level.count({ $or: following, published: true });
        levels = Promise.all(levels);

        return Promise.all([levels, count]);
      })
  } else if(levelType === 'liked') {
    levelPromise = userPromise
      .then(user => {
        var count = user.likedLevels.length;
        user = user.populate({
          path: 'likedLevels',
          select: 'title creator dateCreated starCount',
          populate: {
            path: 'creator',
            select: 'name'
          },
          options: options
        })
        .execPopulate();

        return Promise.all([user, count])
      })
      .then(data => {
        return [data[0].likedLevels,data[1]];
      })
  }

  return levelPromise.then(data => {
    return {
      levels: data[0],
      pages: Math.ceil(data[1]/8)
    };
  })
};

/**
 * EXPORTED FUNCTIONS
 */

export const createDoc = (ModelStr, tieToUser = false) => (req, res, next) => {
  const Model = mongoose.model(ModelStr);
  if (tieToUser) req.body[tieToUser] = req.user._id;

  Model.create(req.body)
    .then(document => res.status(201).json(document))
    .then(null, next);
}

// returns middleware. No auth. Optionally also gets docs based on req.params.id
export const getDocsAndSend = (ModelStr, selectParams = [], populateParams = [], q) => (req, res, next) => {
  const Model = mongoose.model(ModelStr);
  let query = q || {};
  let sort = {};

  if(ModelStr === 'Level') {
    // acceptable search parameters for levels
    if(req.query.title !== undefined) query.title =  { $regex: req.query.title, $options: 'i' };
    if(!isNaN(req.query.starCount)) query.starCount = { $gte: req.query.starCount };

    // acceptable sort parameters for levels
    if(req.query.sort === 'title' || req.query.sort === 'dateCreated' || req.query.sort === 'starCount') {
      if(req.query.by === 'asc' || req.query.by === 'desc' || req.query.by === 'ascending' || req.query.by === 'descending' || req.query.by === 1 || req.query.by === -1) {
        sort[req.query.sort] = req.query.by;
      } else {
        sort[req.query.sort] = 'desc';
      }
    } else {
      sort.dateCreated = 'desc';
    }
  }

  if(ModelStr === 'User') {
    // acceptable search parameters for users
    if(req.query.name !== undefined) query.name = { $regex: req.query.name, $options: 'i' };
    if(req.query.email !== undefined) query.email = req.query.email;
    if(!isNaN(req.query.totalStars)) query.totalStars = { $gte: req.query.totalStars };


    // acceptable sort parameters for users
    if(req.query.sort === 'name' || req.query.sort === 'totalStars' || req.query.sort === 'totalFollowers' || req.query.sort === 'totalCreatedLevels') {
      if(req.query.by === 'asc' || req.query.by === 'desc' || req.query.by === 'ascending' || req.query.by === 'descending' || req.query.by === 1 || req.query.by === -1) {
        sort[req.query.sort] = req.query.by;
      } else {
        sort[req.query.sort] = 'desc';
      }
    } else {
      sort.name = 'asc';
    }
  }

  // allow users to specify results per page and to step through
  //    results by page number
  let page = !isNaN(req.query.page) ? parseInt(req.query.page)-1 : 0;
  let limit = !isNaN(req.query.limit) ? parseInt(req.query.limit) : 20;

  // Finding levels by creator requires async. 
  // Finding levels not by creator does not require async.
  // Create a promise that can hold either a search for users
  //    or a promise wrapper that resolves to the already-
  //    existing query object.
  let queryPromise;

  if(ModelStr === 'Level' && req.query.creator !== undefined) {
    queryPromise = User
      .find({ name: { $regex: req.query.creator, $options: 'i' }})
      .then(function(users) {
        let creators = users.map(function(user) {
          return { creator: user._id };
        });
        query.$or = creators;
        return query;
      });
  } else {
    queryPromise = Promise.resolve(query);
  }

  queryPromise.then((query) => {
    Model.find(query)
      .skip(page*limit)
      .limit(limit)
      .sort(sort)
      .select(selectParams.join(" "))
      .populate(populateParams)
      .then(function(documents) {
        let count = Model.count(query);
        return Promise.all([documents, count]);
      })
      .then(function(results) {
        res.json({
          results: results[0],
          pages: limit !== 0 ? Math.ceil(results[1]/limit) : 1
        });
      })
      .then(null, next);
  })
}

// returns middleware. No auth.
export const getDocAndSend = (ModelStr, selectParams=[], populateParams=[], query) => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findById(id)
    .and(query || {})
    .select( selectParams.join(" ") )
    .populate(populateParams)
    .then(document => res.status(200).header("Access-Control-Allow-Origin",allowedHost).json(document))
    .then(null, next);
}

// returns middleware. No auth.
export const getDocAndUpdate = ModelStr => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findByIdAndUpdate(id, req.body, {
      new: true
    })
    .then(document => res.status(200).json(document))
    .then(null, next);
}

// returns middleware. No auth.
export const getDocAndDelete = ModelStr => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findByIdAndRemove(id)
    .then(document => {
      if (!document) next()();
      else return res.json(document)
    })
    .then(null, next);
}

// returns middleware
export const getDocAndSendIfOwnerOrAdmin = (ModelStr, selectParams = [], populateParams = []) => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findById(id)
    .populate(populateParams.join(' '))
    .then(document => {

      if (!document) next();
      else sendDocIfOwnerOrAdmin(document, req.user, res)
    })
    .then(null, next);
};

// returns middleware
export const getDocAndUpdateIfOwnerOrAdmin = ModelStr => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findById(id)
    .then(document => {
      if (!document) next();
      if (ownerOrAdmin(document, req.user)) {
        //return Model.findByIdAndUpdate(document, req.body, {
          //new: true
        //});
        document = Object.assign( document, req.body );
        document.save();
        return document;
      } else res.status(401).end();
    })
    .then(document => res.status(200).json(document))
    .then(null, next)
};

export const getDocAndRunFunction = (ModelStr, func) => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findById(id)
    .then(document=> {
      if(!document) next();
      else return document[func](req.body.args);
    })
    .then(document => res.status(200).json(document))
    .then(null, next);
};


export const getDocAndRunFunctionIfOwnerOrAdmin = (ModelStr, func) => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findById(id)
    .then(document=> {
      if(!document) next();
      if(ownerOrAdmin(document, req.user)) {
        return document[func](req.body.args);
      } else res.status(401).end();
    })
    .then(document => res.status(200).json(document))
    .then(null, next);
};

export const getUserLevelsByTypeAndSend = () => (req, res, next) => {
  const id = req.user._id;
  const page = req.query.page !== undefined ? req.query.page-1 : 0;
  var userPromise = User.findById(id);

  getLevelsByType(userPromise, req.query.levelType, page)
    .then(data => {
      res.json(data);
    })
    .then(null, next);
}

export const getUserProfileAndSend = () => (req, res, next) => {
  const id = req.user._id;
  var userPromise = User.findById(id);
  var created = getLevelsByType(userPromise, 'created', 0);
  var following = getLevelsByType(userPromise, 'following', 0);
  var liked = getLevelsByType(userPromise, 'liked', 0);
  var drafts = getLevelsByType(userPromise, 'drafts', 0);

  Promise.all([userPromise, created, following, liked, drafts])
    .spread((user, created, following, liked, drafts) => {
      user = user.populate({ path: 'followers', select: 'name', options: { limit: 5 }})
        .populate({ path: 'following', select: 'name', options: { limit: 5 }})
        .execPopulate();
        
      return Promise.all([user, created, following, liked, drafts]);
    })
    .spread((user, created, following, liked, drafts) => {
      res.json({
        user: {
          name: user.name,
          email: user.email,
          following: user.following,
          totalFollowing: user.totalFollowing,
          followers: user.followers,
          totalFollowers: user.totalFollowers,
          totalLikedLevels: user.totalLikedLevels,
          totalCreatedLevels: user.totalCreatedLevels,
          totalStars: user.totalStars
        },
        createdLevels: created,
        followingLevels: following,
        likedLevels: liked,
        draftLevels: drafts
      })
    })
    .then(null, next);
}

export const getUserDocAndRunFunction = (func) => (req, res, next) => {
  const id = req.user._id;

  User.findById(id)
    .then(document=> {
      if(!document) next();
      else return document[req.body.func](req.body.args);
    })
    .then(document => res.status(200).json(document))
    .then(null, next);
}

export const getDocs = (ModelStr, refPropName = false) => (req, res, next) => {
  const Model = mongoose.model(ModelStr);
  let query = {};
  if (refPropName) {
    query[refPropName] = req.params.id
  }

  Model.find(query)
    .then(documents => res.json(documents))
    .then(null, next);
}

// returns middleware
export const getDocAndDeleteIfOwnerOrAdmin = ModelStr => (req, res, next) => {
  const id = req.params.id;
  const Model = mongoose.model(ModelStr);

  Model.findById(id)
    .then(document => {
      if (!document) next();
      if (ownerOrAdmin(document, req.user)) {
        return document.remove();
      } else res.status(401).end();
    })
    .then(document => res.json(document))
    .then(null, next)
};
