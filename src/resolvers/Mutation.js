const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {randomBytes} = require('crypto');
const {promisify} = require('util'); // takes callback based functions and turns them into a promise
const {transport, makeANiceEmail} = require('../mail');
const {hasPermission} = require('../utils');
const stripe = require('../stripe'); // has all the methods to do things like charge, refunds, pull data, receipts, etc

const Mutations = {
  async createItem(parent, args, ctx, info) {
    // check if user is logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // This is how to create a RELATIONSHIP between the Item and the User
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
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
    const item = await ctx.db.query.item({where}, `{ id title user{id}}`); // graphql
    // 2. Check if they own that item, or have the permissions
    const ownsItem = item.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(
      permission =>
        ['ADMIN', 'ITEMDELETE'].includes(permission)
    );

    if (!ownsItem && !hasPermissions) {
      throw new Error("You don't have permission to do that!");
    }
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
    if (!user) {
      throw new Error(`No such user found for Email ${email}`);
    }
    // 2. check if the password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
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
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return {message: 'Goodbye!'};
  },
  async requestReset(parent, args, ctx, info) {
    // 1. Check if this is a real user
    const user = await ctx.db.query.user({where: {email: args.email}});
    if (!user) {
      throw new Error(`No such user found for email ${args.email}`);
    }
    // 2. Set a reset token and expiry on that user
    const randomBytesPromiseified = promisify(randomBytes);
    const resetToken = (await randomBytesPromiseified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: {email: args.email},
      data: {resetToken, resetTokenExpiry},
    });
    // 3. Email them that reset token
    // could be a try catch
    const mailRes = await transport.sendMail({
      from: 'contact@rockingthebump.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(`Your Password Reset Token is here!
      \n\n
      <a href="${process.env
        .FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here to Reset</a>`),
    });
    // 4. Return the message
    return {message: 'Thanks!'};
  },
  async resetPassword(parent, args, ctx, info) {
    // 1. check if passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error("Passwords don't match");
    }
    // 2. check if legit reset token
    // 3. check if expired
    const [user] = await ctx.db.query.users({ // user is destructured and means find the first user
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
      }
    });
    if (!user) {
      throw new Error('This token is either invalid or expired!');
    }
    // 4. Hash the new password
    const password = await bcrypt.hash(args.password, 10);
    // 5. save the new password and remove old reset token
    const updatedUser = await ctx.db.mutation.updateUser({
      where: {email: user.email},
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null
      }
    });
    // 6. Generate JWT
    const token = jwt.sign({userId: updatedUser.id}, process.env.APP_SECRET);
    // 7. Set the JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    // 8. Return the new user
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    // 1. Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You most be logged in!');
    }
    // 2. Query the current user
    const currentuser = await ctx.db.query.user({
        where: {
          id: ctx.request.userId,
        }
      },
      info
    );
    // 3. Check if they have permissions to do this
    hasPermission(currentuser, ['ADMIN', 'PERMISSIONUPDATE']);
    // 4.  Update the permissions
    return ctx.db.mutation.updateUser({
      data: {
        permissions: {
          set: args.permissions
        }
      },
      where: {
        id: args.userId
      }
    })
  },
  async addToCart(parent, args, ctx, info) {
    // 1. Make suer they are signed in
    const {userId} = ctx.request;
    if (!userId) {
      throw new Error('You must be signed in');
    }
    // 2. Query the users current cart
    const [existingCartItem] = await ctx.db.query.cartItems({ //array destructuring for the first element returned
      where: {
        user: {id: userId},
        item: {id: args.id}
      }
    });
    // 3. Check if that item is already in their car and increment by 1 if it is
    if (existingCartItem) {
      console.log('This item is already in cart');
      return ctx.db.mutation.updateCartItem({
          where: {id: existingCartItem.id},
          data: {quantity: existingCartItem.quantity + 1}
        },
        info
      );
    }
    // 4. If its not, create a fresh CartItem for that user.
    return ctx.db.mutation.createCartItem({
        data: {
          user: {
            connect: {id: userId} // user relation connection
          },
          item: {
            connect: {id: args.id}
          }
        }
      },
      info
    );
  },
  async removeFromCart(parent, args, ctx, info) {
    // 1. Find the cart item
    const cartItem = await ctx.db.query.cartItem({
      where: {
        id: args.id
      }
    }, `{id, user {id }}`);
    // 2. Meke sure we find an item
    if(!cartItem) throw  new Error ('No CartItem found!');
    // 3. Make sure they own the cart item
    if(cartItem.user.id !== ctx.request.userId) {
      throw  new Error("You don't own this item");
    }
    // 4. Delete the cart item
    return ctx.db.mutation.deleteCartItem({
      where: {id: args.id}
    },
      info
    );
  },
  async createOrder(parent, args, ctx, info) {
    // 1. Query the current user and make sure they are signed in
    const { userId } = ctx.request;
    if (!userId) throw new Error('You must be signed in to complete this order.');
    const user = await ctx.db.query.user(
      { where: { id: userId } },
      `{
      id
      name
      email
      cart {
        id
        quantity
        item { title price id description image largeImage }
      }}`
    );
    // 2. recalculate the total for the price
    const amount = user.cart.reduce(
      (tally, cartItem) => tally + cartItem.item.price * cartItem.quantity,
      0
    );
    console.log(`Going to charge for a total of ${amount}`);
    // 3. Create the stripe charge (turn token into $$$)
    const charge = await stripe.charges.create({
      amount: amount,
      currency: 'USD',
      source: args.token
    });
    // 4. Convert the CartItems to OrderItems
    // 5. Create the Order
    // 6. Clean up - clear the user cart, delete cartItems
    // 7. Return the order to the client
  }
};

module.exports = Mutations;
