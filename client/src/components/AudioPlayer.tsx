import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import introMusicPath from "@assets/Intro-news_1762617356857.mp3";

interface AudioPlayerProps {
  audioPath?: string;
  reportDate: string | Date;
  "data-testid"?: string;
}

export function AudioPlayer({ audioPath, reportDate, "data-testid": testId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(false);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentReportRef = useRef<string | undefined>(audioPath);

  // Initialize audio elements once
  useEffect(() => {
    if (!introAudioRef.current) {
      introAudioRef.current = new Audio(introMusicPath);
    }
    
    return () => {
      // Cleanup on unmount
      if (introAudioRef.current) {
        introAudioRef.current.pause();
        introAudioRef.current = null;
      }
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
        mainAudioRef.current = null;
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  // Handle audio path changes (new report)
  useEffect(() => {
    if (audioPath && audioPath !== currentReportRef.current) {
      // New report - reset everything
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
        mainAudioRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsIntroPlaying(false);
      currentReportRef.current = audioPath;
    }

    if (audioPath && !mainAudioRef.current) {
      const main = new Audio(audioPath);
      main.volume = volume;
      mainAudioRef.current = main;
      
      const updateTime = () => setCurrentTime(main.currentTime);
      const updateDuration = () => setDuration(main.duration || 0);
      const handleEnded = () => {
        setIsPlaying(false);
        setIsIntroPlaying(false);
      };

      main.addEventListener("timeupdate", updateTime);
      main.addEventListener("loadedmetadata", updateDuration);
      main.addEventListener("ended", handleEnded);

      return () => {
        main.removeEventListener("timeupdate", updateTime);
        main.removeEventListener("loadedmetadata", updateDuration);
        main.removeEventListener("ended", handleEnded);
      };
    }
  }, [audioPath, volume]);

  const handlePlayPause = async () => {
    if (!audioPath) return;

    const intro = introAudioRef.current;
    const main = mainAudioRef.current;

    if (!intro || !main) return;

    if (isPlaying) {
      // Stop playback with fade out
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      const currentlyPlaying = isIntroPlaying ? intro : main;
      const targetVolume = 0;
      const fadeSteps = 10;
      const fadeInterval = 50;
      const volumeDecrement = currentlyPlaying.volume / fadeSteps;

      fadeIntervalRef.current = setInterval(() => {
        if (currentlyPlaying.volume > volumeDecrement) {
          currentlyPlaying.volume = Math.max(0, currentlyPlaying.volume - volumeDecrement);
        } else {
          currentlyPlaying.volume = targetVolume;
          currentlyPlaying.pause();
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
        }
      }, fadeInterval);

      setIsPlaying(false);
      setIsIntroPlaying(false);
    } else {
      // Start playback
      setIsPlaying(true);
      setIsIntroPlaying(true);

      intro.currentTime = 0;
      intro.volume = 0;
      
      try {
        await intro.play();

        // Fade in intro
        const fadeInSteps = 10;
        const fadeInInterval = 50;
        const volumeIncrement = volume / fadeInSteps;
        
        fadeIntervalRef.current = setInterval(() => {
          if (intro.volume < volume - volumeIncrement) {
            intro.volume = Math.min(volume, intro.volume + volumeIncrement);
          } else {
            intro.volume = volume;
            if (fadeIntervalRef.current) {
              clearInterval(fadeIntervalRef.current);
              fadeIntervalRef.current = null;
            }
          }
        }, fadeInInterval);

        // Wait for metadata to be loaded
        if (!intro.duration) {
          await new Promise<void>((resolve) => {
            intro.addEventListener("loadedmetadata", () => resolve(), { once: true });
          });
        }

        // Schedule fade out (2 seconds before end, min 2 second intro)
        if (intro.duration && intro.duration > 2) {
          const fadeOutDuration = 2000;
          const fadeOutStart = Math.max(0, (intro.duration - fadeOutDuration / 1000) * 1000);
          
          setTimeout(() => {
            if (fadeIntervalRef.current) {
              clearInterval(fadeIntervalRef.current);
            }

            const fadeSteps = 20;
            const fadeInterval = fadeOutDuration / fadeSteps;
            const volumeDecrement = intro.volume / fadeSteps;

            fadeIntervalRef.current = setInterval(() => {
              if (intro.volume > volumeDecrement) {
                intro.volume = Math.max(0, intro.volume - volumeDecrement);
              } else {
                intro.volume = 0;
                intro.pause();
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
                setIsIntroPlaying(false);
              }
            }, fadeInterval);
          }, fadeOutStart);
        }

        intro.addEventListener("ended", async () => {
          setIsIntroPlaying(false);
          if (!isPlaying) return; // User stopped during intro
          
          main.volume = 0;
          main.currentTime = 0;
          
          try {
            await main.play();
            
            // Fade in main track
            const fadeInSteps = 10;
            const fadeInInterval = 50;
            const volumeIncrement = volume / fadeInSteps;
            
            fadeIntervalRef.current = setInterval(() => {
              if (main.volume < volume - volumeIncrement) {
                main.volume = Math.min(volume, main.volume + volumeIncrement);
              } else {
                main.volume = volume;
                if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
                }
              }
            }, fadeInInterval);
          } catch (err) {
            console.error("Error playing main audio:", err);
            setIsPlaying(false);
          }
        }, { once: true });

      } catch (err) {
        console.error("Error playing intro audio:", err);
        setIsPlaying(false);
        setIsIntroPlaying(false);
      }
    }
  };

  const handleSeek = (values: number[]) => {
    const main = mainAudioRef.current;
    if (main && !isIntroPlaying) {
      main.currentTime = values[0];
      setCurrentTime(values[0]);
    }
  };

  const handleVolumeChange = (values: number[]) => {
    const newVolume = values[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    
    if (introAudioRef.current) {
      introAudioRef.current.volume = newVolume;
    }
    if (mainAudioRef.current) {
      mainAudioRef.current.volume = newVolume;
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    const newVolume = newMuted ? 0 : 1;
    setVolume(newVolume);
    
    if (introAudioRef.current) {
      introAudioRef.current.volume = newVolume;
    }
    if (mainAudioRef.current) {
      mainAudioRef.current.volume = newVolume;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!audioPath) {
    return (
      <div className="text-center text-muted-foreground" data-testid={testId}>
        <p className="text-sm">Audio report is being generated...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6" data-testid={testId}>
      {/* Play/Pause Button */}
      <div className="flex justify-center">
        <Button
          size="icon"
          variant="default"
          className="h-24 w-24 rounded-full shadow-lg hover-elevate active-elevate-2"
          onClick={handlePlayPause}
          data-testid="button-play-pause"
        >
          {isPlaying ? (
            <Pause className="h-10 w-10" />
          ) : (
            <Play className="h-10 w-10 ml-1" />
          )}
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={handleSeek}
          disabled={isIntroPlaying}
          className="cursor-pointer"
          data-testid="slider-progress"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span data-testid="text-current-time">{formatTime(currentTime)}</span>
          <span data-testid="text-duration">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={toggleMute}
          data-testid="button-mute"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
        <Slider
          value={[volume]}
          max={1}
          step={0.01}
          onValueChange={handleVolumeChange}
          className="w-32"
          data-testid="slider-volume"
        />
      </div>
    </div>
  );
}
