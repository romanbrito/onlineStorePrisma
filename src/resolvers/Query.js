const {forwardTo} = require('prisma-binding');
const {hasPermission} = require('../utils');

const Query = {
  items: forwardTo('db'),
  item: forwardTo('db'),
  itemsConnection: forwardTo('db'),
  me(parent, args, ctx, info) {
    // check if there is a current user ID
    if (!ctx.request.userId) {
      return null;
    }
    return ctx.db.query.user({ //promise
        where: {id: ctx.request.userId}
      },
      info
    ); // info is the query from the front end
  },
  async users(parent, args, ctx, info) {
    // 1. check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in!');
    }
    // 2. check if user has permission to query
    hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);

    // 3. query all the users
    return ctx.db.query.users({}, info); //info contains all the graphql query that contain the fields
                                    // we are requesting from front end

  }
};

module.exports = Query;