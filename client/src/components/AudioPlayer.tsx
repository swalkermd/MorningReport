import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";
import introMusicPath from "@assets/Intro-news_1762617356857.mp3";

interface AudioPlayerProps {
  audioPath?: string | null;
  audioPaths?: string[] | null;
  reportDate: string | Date;
  "data-testid"?: string;
}

export function AudioPlayer({ audioPath, audioPaths, reportDate, "data-testid": testId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [currentReport, setCurrentReport] = useState<string | null | undefined>(audioPath);
  const loadedAudioPathRef = useRef<string | null>(null);
  
  // Use audioPaths array if available, otherwise fall back to single audioPath
  // Memoize to prevent effect from retriggering on every render
  const audioSegments = useMemo(
    () => audioPaths && audioPaths.length > 0 ? audioPaths : (audioPath ? [audioPath] : []),
    [audioPaths, audioPath]
  );

  useEffect(() => {
    if (!introAudioRef.current) {
      introAudioRef.current = new Audio(introMusicPath);
    }
    
    return () => {
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

  useEffect(() => {
    if (audioPath && audioPath !== currentReport) {
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
        mainAudioRef.current = null;
        loadedAudioPathRef.current = null;
      }
      setIsPlaying(false);
      setIsIntroPlaying(false);
      setCurrentSegment(0);
      setCurrentReport(audioPath);
    }

    const currentAudioPath = audioSegments[currentSegment];
    
    // Only create new Audio if we haven't loaded this path yet
    if (currentAudioPath && loadedAudioPathRef.current !== currentAudioPath) {
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
      }
      
      const main = new Audio(currentAudioPath);
      mainAudioRef.current = main;
      loadedAudioPathRef.current = currentAudioPath;
      
      const handleEnded = () => {
        if (currentSegment < audioSegments.length - 1) {
          setCurrentSegment(prev => prev + 1);
          loadedAudioPathRef.current = null; // Clear so next segment loads
        } else {
          setIsPlaying(false);
          setIsIntroPlaying(false);
          setCurrentSegment(0);
          loadedAudioPathRef.current = null;
        }
      };

      main.addEventListener("ended", handleEnded);

      return () => {
        main.removeEventListener("ended", handleEnded);
      };
    }
  }, [audioPath, currentReport, currentSegment, audioSegments]);

  useEffect(() => {
    if (isPlaying && !isIntroPlaying && mainAudioRef.current && mainAudioRef.current.paused) {
      mainAudioRef.current.volume = 0;
      mainAudioRef.current.play().then(() => {
        const fadeInSteps = 10;
        const fadeInInterval = 50;
        const targetVolume = 1;
        const volumeIncrement = targetVolume / fadeInSteps;
        
        fadeIntervalRef.current = setInterval(() => {
          if (mainAudioRef.current) {
            if (mainAudioRef.current.volume < targetVolume - volumeIncrement) {
              mainAudioRef.current.volume = Math.min(targetVolume, mainAudioRef.current.volume + volumeIncrement);
            } else {
              mainAudioRef.current.volume = targetVolume;
              if (fadeIntervalRef.current) {
                clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }
            }
          }
        }, fadeInInterval);
      }).catch(err => {
        console.error("Error auto-playing next segment:", err);
      });
    }
  }, [currentSegment, isPlaying, isIntroPlaying]);

  const handlePlayPause = async () => {
    if (audioSegments.length === 0) return;

    const intro = introAudioRef.current;
    const main = mainAudioRef.current;

    if (!intro || !main) return;

    if (isPlaying) {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      const currentlyPlaying = isIntroPlaying ? intro : main;
      const fadeSteps = 10;
      const fadeInterval = 50;
      const volumeDecrement = currentlyPlaying.volume / fadeSteps;

      fadeIntervalRef.current = setInterval(() => {
        if (currentlyPlaying.volume > volumeDecrement) {
          currentlyPlaying.volume = Math.max(0, currentlyPlaying.volume - volumeDecrement);
        } else {
          currentlyPlaying.volume = 0;
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
      setIsPlaying(true);
      setIsIntroPlaying(true);

      intro.currentTime = 0;
      intro.volume = 0;
      
      try {
        await intro.play();

        const fadeInSteps = 10;
        const fadeInInterval = 50;
        const targetVolume = 1;
        const volumeIncrement = targetVolume / fadeInSteps;
        
        fadeIntervalRef.current = setInterval(() => {
          if (intro.volume < targetVolume - volumeIncrement) {
            intro.volume = Math.min(targetVolume, intro.volume + volumeIncrement);
          } else {
            intro.volume = targetVolume;
            if (fadeIntervalRef.current) {
              clearInterval(fadeIntervalRef.current);
              fadeIntervalRef.current = null;
            }
          }
        }, fadeInInterval);

        if (!intro.duration) {
          await new Promise<void>((resolve) => {
            intro.addEventListener("loadedmetadata", () => resolve(), { once: true });
          });
        }

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
          if (!isPlaying) return;
          
          main.volume = 0;
          main.currentTime = 0;
          
          try {
            await main.play();
            
            const fadeInSteps = 10;
            const fadeInInterval = 50;
            const targetVolume = 1;
            const volumeIncrement = targetVolume / fadeInSteps;
            
            fadeIntervalRef.current = setInterval(() => {
              if (main.volume < targetVolume - volumeIncrement) {
                main.volume = Math.min(targetVolume, main.volume + volumeIncrement);
              } else {
                main.volume = targetVolume;
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

  if (audioSegments.length === 0) {
    return (
      <Button
        className="w-full h-12"
        variant="secondary"
        disabled
        data-testid={testId}
      >
        Generating report...
      </Button>
    );
  }

  return (
    <Button
      className="w-full h-12 gap-3 text-base"
      variant="default"
      onClick={handlePlayPause}
      data-testid={testId}
    >
      {isPlaying ? (
        <>
          <Pause className="h-5 w-5" />
          Pause Report
        </>
      ) : (
        <>
          <Play className="h-5 w-5" />
          Play Report
        </>
      )}
    </Button>
  );
}
