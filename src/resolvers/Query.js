const {forwardTo} = require('prisma-binding');

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
    ); // info is the query from the front enc
  }
};

module.exports = Query;