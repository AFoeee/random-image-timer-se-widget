# Random Image Timer  
This StreamElements custom widget can be used to visualize some sorts of content gamification.  
An example might be the display of
 - a self-imposed, changing class focus in a RPG.
 - the current item in a randomized giveaway.

Special thanks to [Laiyart](https://www.twitch.tv/laiyart) for the idea.


## Description of operation:  
The widget randomly picks images from an image pool at predetermined time intervals and displays them.  
It has also options to limit said randomness to a certain degree.

See also this [demonstration video](https://www.youtube.com/watch?v=YQAS3tV4uDM).


## Chat command types:  
 - `!img random` 
   
   Swaps the current image with a random one.
   
 - `!img n` 
   
   Swaps the current image with the `n`th video of the pool.  
   The placeholder `n` can be a number between 1 and the total number of images in the pool.
   
 - `!img timer pause` 
   
   Pauses the timer.
   
 - `!img timer resume` 
   
   Unpauses the timer.
   
 - `!img timer reset` 
   
   Resets the timer to initial time span.
   
 - `!img timer h:m:s`
   
   Sets the timer to the specified amount of time.  
   
   A single number is interpreted as seconds.  
   Two numbers are interpreted as minutes and seconds and so on.  


## Used libraries:  
 - [Reboot0's Widget Tools](https://reboot0-de.github.io/se-tools/index.html)  
