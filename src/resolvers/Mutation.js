const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Mutations = {
  async createItem(parent, args, ctx, info) {
    // if (!ctx.request.userId) {
    //   throw new Error('You must be logged in to do that!');
    // }

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // This is how to create a relationship between the Item and the User
          // user: {
          //   connect: {
          //     id: ctx.request.userId,
          //   },
          // },
          ...args,
        },
      },
      info
    );

    console.log(item);

    return item;
  },
  updateItem(parent, args, ctx, info) {
    // first take a copy of the updates
    const updates = {...args};
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },
  async deleteItem(parent, args, ctx, info) {
    const where = {id: args.id};
    // 1. find the item
    const item = await ctx.db.query.item({where}, `{ id title}`); // graphql
    // 2. Check if they own that item, or have the permissions
    // TODO
    // 3. Delete it!
    return ctx.db.mutation.deleteItem({where}, info);
  },
  async signup(parent, args, ctx, info) {
    // lowercase email
    args.email = args.email.toLowerCase();
    // hash password
    const password = await bcrypt.hash(args.password, 10);
    // create user in db
    const user = await ctx.db.mutation.createUser({
        data: {
          ...args,
          password,
          permissions: {set: ['USER']}
        }
      },
      info
    );
    // create jwt token
    const token = jwt.sign({userId: user.id}, process.env.APP_SECRET);
    // set jwt as cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    // return user to the browser
    return user;
  },
  async signin(parent, args, ctx, info) {
    const {email, password} = args;
    // 1. check if there is a user with that email
    const user = await ctx.db.query.user({where: {email}});
    if(!user) {
      throw new Error(`No such user found for Email ${email}`);
    }
    // 2. check if the password is correct
    const valid = await bcrypt.compare(password, user.password);
    if(!valid) {
      throw new Error('Invalid Password!');
    }
    // 3. generate the JWT token
    const token = jwt.sign({userId: user.id}, process.env.APP_SECRET);
    // 4. set the cookie with the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    // 5. Return the user
    return user;
  }
};

module.exports = Mutations;
